// Nexum Console Transport — server-side processing library
// All functions run in API routes (server-side only). Never called from browser.
import { adminClient } from "@/lib/apiAuth";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConsoleWarehouse {
  id: string; warehouse_code: string; warehouse_name: string;
  city: string; state: string; full_address?: string; postcode?: string;
  open_time: string; close_time: string; operating_days: string[];
  contact_name?: string; contact_phone?: string; status: string;
}

export interface ConsoleRoute {
  id: string; route_code: string;
  origin_warehouse_id: string; destination_warehouse_id: string;
  origin_city: string; destination_city: string;
  max_transit_hours: number; base_customer_price: number;
  supplier_parcel_payout: number; nexum_commission_rate: number;
  minimum_supplier_trip_payout: number; status: string;
}

export interface ConsoleSlot {
  id: string; slot_reference: string; route_id: string;
  departure_time: string; expected_arrival_time?: string;
  same_day_arrival: boolean; slot_date: string;
  supplier_company_id?: string; driver_user_id?: string;
  vehicle_number?: string; slot_status: string;
  booked_at?: string; actual_departure_at?: string; actual_arrival_at?: string;
}

export interface ConsoleParcel {
  id: string; tracking_number: string;
  customer_company_id?: string; customer_user_id?: string;
  route_id?: string; slot_id?: string;
  origin_warehouse_id?: string; destination_warehouse_id?: string;
  sender_name?: string; sender_contact?: string;
  sender_id_number_masked?: string;
  receiver_name?: string; receiver_contact?: string;
  receiver_id_number_masked?: string;
  commodity_content?: string; contains_liquid: boolean; fragile: boolean;
  parcel_length_cm?: number; parcel_width_cm?: number;
  parcel_height_cm?: number; parcel_weight_kg?: number;
  parcel_price: number; currency: string;
  payment_status: string; parcel_status: string;
  label_printed: boolean; qr_code_value?: string;
  nexum_commission: number; supplier_earning: number;
  manual_acceptance_required: boolean; manual_acceptance_granted: boolean;
  whatsapp_phone?: string; created_at: string;
}

export interface CreateParcelInput {
  route_id: string; slot_id: string;
  sender_name: string; sender_contact: string; sender_ic?: string;
  receiver_name: string; receiver_contact: string; receiver_ic?: string;
  commodity_content: string; contains_liquid: boolean; fragile: boolean;
  parcel_length_cm: number; parcel_width_cm: number;
  parcel_height_cm: number; parcel_weight_kg: number;
  whatsapp_phone?: string;
}

export interface ScanPayload {
  event_type: string; event_description?: string;
  event_location?: string; latitude?: number; longitude?: number;
  photo_url?: string; event_source?: string; scanned_by_user_id?: string;
}

// Excluded goods keywords
const EXCLUDED_GOODS = [
  'illegal','drug','weapon','explosive','flammable','perishable',
  'temperature','cash','jewel','gold','silver','live animal','animal',
  'medicine','pharmaceutical','firearm','gun','ammo','ammunition',
  'tobacco','alcohol','poison','radioactive','hazardous','dangerous'
];

export function isGoodsExcluded(content: string): boolean {
  const lower = content.toLowerCase();
  return EXCLUDED_GOODS.some(k => lower.includes(k));
}

// Simple mask: last 4 visible, rest are *
export function maskIC(ic: string): string {
  if (!ic || ic.length < 4) return '****';
  return '*'.repeat(ic.length - 4) + ic.slice(-4);
}

// Simple reversible encoding for IC (not true encryption — use pgcrypto in prod)
export function encodeIC(ic: string): string {
  return Buffer.from(ic, 'utf8').toString('base64');
}

// ── Wallet helpers ────────────────────────────────────────────────────────────

export async function getOrCreateWallet(
  companyId: string,
  walletType: 'Customer' | 'Supplier'
): Promise<string> {
  const db = adminClient();
  const { data: existing } = await db
    .from('console_wallets')
    .select('id')
    .eq('company_id', companyId)
    .eq('wallet_type', walletType)
    .single();
  if (existing) return existing.id;

  const { data: created, error } = await db
    .from('console_wallets')
    .insert({ company_id: companyId, wallet_type: walletType })
    .select('id')
    .single();
  if (error || !created) throw new Error('Failed to create wallet: ' + error?.message);
  return created.id;
}

export async function getWalletBalance(
  companyId: string,
  walletType: 'Customer' | 'Supplier'
): Promise<{ available: number; reserved: number; pending: number; walletId: string }> {
  const db = adminClient();
  const { data } = await db
    .from('console_wallets')
    .select('id, available_balance, reserved_balance, pending_balance')
    .eq('company_id', companyId)
    .eq('wallet_type', walletType)
    .single();
  if (!data) return { available: 0, reserved: 0, pending: 0, walletId: '' };
  return {
    available: Number(data.available_balance),
    reserved:  Number(data.reserved_balance),
    pending:   Number(data.pending_balance),
    walletId:  data.id,
  };
}

// ── Top Up ────────────────────────────────────────────────────────────────────

export async function topUpConsoleWallet(
  companyId: string, amount: number, walletType: 'Customer' | 'Supplier',
  description = ''
): Promise<{ ok: boolean; error?: string }> {
  if (amount < 100) return { ok: false, error: 'Minimum top-up is RM100.' };

  const db = adminClient();
  const walletId = await getOrCreateWallet(companyId, walletType);

  await db.from('console_wallets')
    .update({ available_balance: db.rpc as unknown as number, updated_at: new Date().toISOString() })
    .eq('id', walletId);

  // Use raw SQL via rpc for atomic increment
  const { error: txErr } = await db.rpc('console_topup_wallet', {
    p_wallet_id: walletId, p_amount: amount
  });

  if (txErr) {
    // Fallback: manual update
    const { data: cur } = await db.from('console_wallets').select('available_balance').eq('id', walletId).single();
    await db.from('console_wallets').update({
      available_balance: (Number(cur?.available_balance ?? 0)) + amount,
      updated_at: new Date().toISOString()
    }).eq('id', walletId);
  }

  await db.from('console_wallet_transactions').insert({
    wallet_id: walletId, company_id: companyId,
    transaction_type: 'Top Up', amount, status: 'Completed',
    description: description || `Wallet top-up RM${amount.toFixed(2)}`
  });

  return { ok: true };
}

// Direct top-up (bypasses the RPC fallback above — simpler)
export async function directTopUp(
  companyId: string, amount: number, walletType: 'Customer' | 'Supplier',
  description?: string
): Promise<{ ok: boolean; error?: string }> {
  if (amount < 100) return { ok: false, error: 'Minimum top-up is RM100.' };
  const db = adminClient();
  const walletId = await getOrCreateWallet(companyId, walletType);
  const { data: cur } = await db.from('console_wallets')
    .select('available_balance').eq('id', walletId).single();
  await db.from('console_wallets').update({
    available_balance: (Number(cur?.available_balance ?? 0)) + amount,
    updated_at: new Date().toISOString()
  }).eq('id', walletId);
  await db.from('console_wallet_transactions').insert({
    wallet_id: walletId, company_id: companyId,
    transaction_type: 'Top Up', amount, status: 'Completed',
    description: description || `Wallet top-up RM${amount.toFixed(2)}`
  });
  return { ok: true };
}

// ── Parcel Creation ───────────────────────────────────────────────────────────

export async function createConsoleParcel(
  input: CreateParcelInput, userId: string, companyId: string
): Promise<{ ok: boolean; parcel?: ConsoleParcel; error?: string }> {
  const db = adminClient();

  // Validate goods
  if (isGoodsExcluded(input.commodity_content)) {
    return { ok: false, error: 'Declared goods are not accepted for console transport. General goods only.' };
  }

  // Fragile/liquid flagging
  const needsManual = (input.fragile || input.contains_liquid);

  // Validate dimensions
  if (input.parcel_length_cm > 30 || input.parcel_width_cm > 30 || input.parcel_height_cm > 30) {
    return { ok: false, error: 'Parcel exceeds maximum size 30×30×30 cm.' };
  }
  if (input.parcel_weight_kg > 15) {
    return { ok: false, error: 'Parcel exceeds maximum weight of 15 kg.' };
  }

  // Check customer wallet balance
  const { available, walletId } = await getWalletBalance(companyId, 'Customer');
  if (available < 50) {
    return { ok: false, error: `Insufficient wallet balance. Available: RM${available.toFixed(2)}. Required: RM50.00.` };
  }

  // Get route + slot
  const { data: slot, error: slotErr } = await db
    .from('console_route_slots')
    .select('*, console_routes(*)')
    .eq('id', input.slot_id)
    .single();
  if (slotErr || !slot) return { ok: false, error: 'Invalid slot selected.' };
  if (slot.slot_status !== 'Open' && slot.slot_status !== 'Booked') {
    return { ok: false, error: 'Selected slot is no longer available.' };
  }

  const route = slot.console_routes as ConsoleRoute;

  // Generate tracking number
  const { data: tnData } = await db.rpc('generate_console_tracking_number');
  const trackingNumber: string = tnData ?? `NX-${Date.now()}`;

  // Mask + encode IC
  const senderMasked   = input.sender_ic   ? maskIC(input.sender_ic)   : null;
  const receiverMasked = input.receiver_ic  ? maskIC(input.receiver_ic)  : null;
  const senderEnc      = input.sender_ic   ? encodeIC(input.sender_ic)   : null;
  const receiverEnc    = input.receiver_ic  ? encodeIC(input.receiver_ic)  : null;

  // Deduct from customer wallet
  const { data: curWallet } = await db.from('console_wallets')
    .select('available_balance, reserved_balance').eq('id', walletId).single();
  await db.from('console_wallets').update({
    available_balance: Number(curWallet?.available_balance ?? 0) - 50,
    reserved_balance:  Number(curWallet?.reserved_balance  ?? 0) + 50,
    updated_at: new Date().toISOString()
  }).eq('id', walletId);

  // Record payment transaction
  await db.from('console_wallet_transactions').insert({
    wallet_id: walletId, company_id: companyId,
    transaction_type: 'Parcel Payment', amount: 50, status: 'Completed',
    reference_type: 'tracking', reference_id: trackingNumber,
    description: `Parcel payment — ${trackingNumber}`
  });

  // Create parcel record
  const { data: parcel, error: pErr } = await db.from('console_parcels').insert({
    tracking_number:            trackingNumber,
    customer_company_id:        companyId,
    customer_user_id:           userId,
    route_id:                   input.route_id,
    slot_id:                    input.slot_id,
    origin_warehouse_id:        route.origin_warehouse_id,
    destination_warehouse_id:   route.destination_warehouse_id,
    sender_name:                input.sender_name,
    sender_contact:             input.sender_contact,
    sender_id_number_encrypted: senderEnc,
    sender_id_number_masked:    senderMasked,
    receiver_name:              input.receiver_name,
    receiver_contact:           input.receiver_contact,
    receiver_id_number_encrypted: receiverEnc,
    receiver_id_number_masked:  receiverMasked,
    commodity_content:          input.commodity_content,
    contains_liquid:            input.contains_liquid,
    fragile:                    input.fragile,
    parcel_length_cm:           input.parcel_length_cm,
    parcel_width_cm:            input.parcel_width_cm,
    parcel_height_cm:           input.parcel_height_cm,
    parcel_weight_kg:           input.parcel_weight_kg,
    parcel_price:               50,
    payment_status:             'Paid',
    parcel_status:              'Created',
    qr_code_value:              trackingNumber,
    barcode_value:              trackingNumber,
    manual_acceptance_required: needsManual,
    whatsapp_phone:             input.whatsapp_phone,
    nexum_commission:           5,   // 10% of RM50
    supplier_earning:           0,   // set after completion
  }).select().single();

  if (pErr || !parcel) {
    // Refund wallet on failure
    await db.from('console_wallets').update({
      available_balance: Number(curWallet?.available_balance ?? 0),
      reserved_balance:  Number(curWallet?.reserved_balance  ?? 0),
      updated_at: new Date().toISOString()
    }).eq('id', walletId);
    return { ok: false, error: 'Failed to create parcel: ' + pErr?.message };
  }

  // Create 'Created' event
  await db.from('console_parcel_events').insert({
    tracking_number: trackingNumber,
    event_type: 'Created',
    event_description: 'Parcel booking confirmed. Prepaid. Awaiting drop-off at origin warehouse.',
    event_source: 'Customer'
  });

  // Schedule WhatsApp (mark as pending)
  await createWhatsAppEvent(trackingNumber, 'Created', input.whatsapp_phone ?? '');

  return { ok: true, parcel: parcel as ConsoleParcel };
}

// ── Scan / Status Update ──────────────────────────────────────────────────────

export async function scanConsoleParcel(
  trackingNumber: string, payload: ScanPayload, actingUserId: string
): Promise<{ ok: boolean; error?: string }> {
  const db = adminClient();

  const { data: parcel, error: pErr } = await db
    .from('console_parcels')
    .select('*, console_route_slots(supplier_company_id)')
    .eq('tracking_number', trackingNumber)
    .single();

  if (pErr || !parcel) return { ok: false, error: 'Parcel not found.' };
  if (parcel.parcel_status === 'Cancelled') return { ok: false, error: 'Parcel is cancelled.' };

  // Map event type → new parcel status
  const statusMap: Record<string, string> = {
    'Origin Scan In':       'Received at Origin Warehouse',
    'Driver Pickup Scan':   'Loaded to Driver',
    'Driver Departed':      'In Transit',
    'Destination Scan In':  'Arrived at Destination Warehouse',
    'POD Uploaded':         'Ready for Collection',
    'Ready for Collection': 'Ready for Collection',
    'Completed':            'Completed',
    'Exception':            'Exception',
  };

  const newStatus = statusMap[payload.event_type];

  // Record event
  await db.from('console_parcel_events').insert({
    tracking_number:   trackingNumber,
    event_type:        payload.event_type,
    event_description: payload.event_description ?? payload.event_type,
    event_location:    payload.event_location,
    latitude:          payload.latitude,
    longitude:         payload.longitude,
    photo_url:         payload.photo_url,
    scanned_by:        actingUserId,
    event_source:      payload.event_source ?? 'System',
    raw_payload:       {},
  });

  // Update parcel status
  if (newStatus) {
    await db.from('console_parcels').update({
      parcel_status: newStatus,
      updated_at: new Date().toISOString()
    }).eq('tracking_number', trackingNumber);
  }

  // If arrived at destination, mark slot as completed + release earnings
  if (payload.event_type === 'Destination Scan In' && parcel.slot_id) {
    // Check if ALL parcels in slot are now arrived
    const { data: remaining } = await db
      .from('console_parcels')
      .select('id')
      .eq('slot_id', parcel.slot_id)
      .not('parcel_status', 'in', '("Arrived at Destination Warehouse","Completed","Cancelled","Exception")');

    if (!remaining || remaining.length === 0) {
      await db.from('console_route_slots').update({
        slot_status: 'Completed',
        actual_arrival_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', parcel.slot_id);

      await db.rpc('release_console_supplier_earnings', { p_slot_id: parcel.slot_id });
    }
  }

  // WhatsApp event for key milestones
  const waEvents = ['Origin Scan In','Driver Departed','Destination Scan In','Ready for Collection','Exception'];
  if (waEvents.includes(payload.event_type)) {
    await createWhatsAppEvent(trackingNumber, payload.event_type, parcel.whatsapp_phone ?? '');
  }

  return { ok: true };
}

// ── Slot Booking ──────────────────────────────────────────────────────────────

export async function bookConsoleSlot(
  slotId: string, supplierCompanyId: string,
  vehicleNumber: string, driverUserId?: string
): Promise<{ ok: boolean; error?: string }> {
  const db = adminClient();

  // Check supplier is approved
  const { data: company } = await db.from('companies')
    .select('approval_status').eq('id', supplierCompanyId).single();
  if (!company || company.approval_status !== 'approved') {
    return { ok: false, error: 'Supplier is not approved. Await admin approval before booking slots.' };
  }

  const { data: slot } = await db.from('console_route_slots')
    .select('*').eq('id', slotId).single();
  if (!slot) return { ok: false, error: 'Slot not found.' };
  if (slot.slot_status !== 'Open') return { ok: false, error: 'Slot is no longer open.' };

  await db.from('console_route_slots').update({
    supplier_company_id: supplierCompanyId,
    driver_user_id:      driverUserId ?? null,
    vehicle_number:      vehicleNumber,
    slot_status:         'Booked',
    booked_at:           new Date().toISOString(),
    updated_at:          new Date().toISOString()
  }).eq('id', slotId);

  return { ok: true };
}

// ── Withdrawal ────────────────────────────────────────────────────────────────

export async function requestConsoleWithdrawal(
  companyId: string, amount: number, walletType: 'Customer' | 'Supplier'
): Promise<{ ok: boolean; error?: string; fee?: number }> {
  const db = adminClient();
  const { available, walletId } = await getWalletBalance(companyId, walletType);

  let fee = 0;

  if (walletType === 'Customer') {
    fee = Math.round(amount * 0.10 * 100) / 100;  // 10% surcharge
    const total = amount + fee;
    if (available < total) {
      return { ok: false, error: `Insufficient balance. Withdrawal RM${amount} + 10% surcharge RM${fee} = RM${total.toFixed(2)}. Available: RM${available.toFixed(2)}.` };
    }
    const { data: cur } = await db.from('console_wallets').select('available_balance').eq('id', walletId).single();
    await db.from('console_wallets').update({
      available_balance: Number(cur?.available_balance ?? 0) - total,
      updated_at: new Date().toISOString()
    }).eq('id', walletId);

    await db.from('console_wallet_transactions').insert([
      { wallet_id: walletId, company_id: companyId, transaction_type: 'Withdrawal Request', amount, status: 'Pending', description: `Withdrawal request RM${amount.toFixed(2)}` },
      { wallet_id: walletId, company_id: companyId, transaction_type: 'Withdrawal Surcharge', amount: fee, status: 'Completed', description: '10% customer withdrawal surcharge' },
    ]);

  } else {
    // Supplier: check weekly count
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());  // Sunday
    weekStart.setHours(0, 0, 0, 0);

    const { count } = await db.from('console_wallet_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('transaction_type', 'Withdrawal Request')
      .gte('created_at', weekStart.toISOString());

    if ((count ?? 0) >= 1) {
      fee = 5;  // RM5 processing fee for >1 withdrawal per week
    }

    const total = amount + fee;
    if (available < total) {
      return { ok: false, error: `Insufficient available balance. Available: RM${available.toFixed(2)}.` };
    }

    const { data: cur } = await db.from('console_wallets').select('available_balance').eq('id', walletId).single();
    await db.from('console_wallets').update({
      available_balance: Number(cur?.available_balance ?? 0) - total,
      updated_at: new Date().toISOString()
    }).eq('id', walletId);

    const txns: object[] = [
      { wallet_id: walletId, company_id: companyId, transaction_type: 'Withdrawal Request', amount, status: 'Pending', description: `Withdrawal request RM${amount.toFixed(2)} — processing within 24h` }
    ];
    if (fee > 0) {
      txns.push({ wallet_id: walletId, company_id: companyId, transaction_type: 'Processing Fee', amount: fee, status: 'Completed', description: 'RM5 processing fee (>1 withdrawal this week)' });
    }
    await db.from('console_wallet_transactions').insert(txns);
  }

  return { ok: true, fee };
}

// ── WhatsApp Notification ─────────────────────────────────────────────────────

const WA_TEMPLATES: Record<string, string> = {
  'Created':                    'Hi! Your parcel *{tn}* has been confirmed and is prepaid. Please drop it off at the origin warehouse during operating hours (Mon-Sat, 10am-7pm). Thank you for choosing Nexum Console Transport.',
  'Origin Scan In':             'Your parcel *{tn}* has been received at the origin warehouse and is ready for loading. You will be notified once it departs.',
  'Driver Departed':            'Your parcel *{tn}* has been loaded and the transport has departed. Estimated arrival at destination warehouse within the scheduled transit time.',
  'Destination Scan In':        'Your parcel *{tn}* has arrived at the destination warehouse. The receiver may collect it during operating hours (Mon-Sat, 10am-7pm).',
  'Ready for Collection':       'Your parcel *{tn}* is ready for collection at the destination warehouse. Please collect within 3 business days.',
  'Exception':                  'An exception has been flagged for parcel *{tn}*. Our team will contact you shortly to resolve this.',
  'Loaded to Driver':           'Your parcel *{tn}* has been handed to the approved transport provider. It is now in transit.',
};

export async function createWhatsAppEvent(
  trackingNumber: string, eventType: string, phone: string
): Promise<void> {
  const db = adminClient();
  const template = WA_TEMPLATES[eventType];
  if (!template) return;

  const message = template.replace('{tn}', trackingNumber);

  await db.from('console_parcel_events').insert({
    tracking_number:   trackingNumber,
    event_type:        'WhatsApp Sent',
    event_description: `[PENDING MANUAL SEND] To: ${phone || 'N/A'} | ${message}`,
    event_source:      'System',
    raw_payload:       { phone, message, status: 'pending_manual_send', trigger: eventType }
  });
}

// ── Bulk Slot Generation ──────────────────────────────────────────────────────

export async function generateDailySlots(
  routeId: string, slotDate: string
): Promise<{ created: number; skipped: number }> {
  const db = adminClient();

  // Route details for same-day arrival check
  const { data: route } = await db.from('console_routes')
    .select('*, console_warehouses!destination_warehouse_id(close_time)')
    .eq('id', routeId).single();
  if (!route) return { created: 0, skipped: 0 };

  const closeTime = 19; // 19:00
  const maxHours  = Number(route.max_transit_hours);
  const latestDeparture = closeTime - maxHours; // e.g., 6h route → latest 13:00

  // Hours 10:00 to 18:00 (last departure at 18:00, arrive 24:00 max, but beyond close)
  const departures: string[] = [];
  for (let h = 10; h <= 18; h++) {
    departures.push(`${String(h).padStart(2,'0')}:00`);
  }

  let created = 0; let skipped = 0;

  for (const dep of departures) {
    const depHour = parseInt(dep.split(':')[0]);
    const arrHour = depHour + maxHours;
    const sameDay = arrHour <= closeTime;
    const arrTime = `${String(Math.floor(arrHour)).padStart(2,'0')}:${depHour % 1 === 0 ? '00' : '30'}`;

    // Get slot reference
    const { data: ref } = await db.rpc('generate_console_slot_reference');

    const { error } = await db.from('console_route_slots').insert({
      slot_reference:        ref ?? `SL-${Date.now()}`,
      route_id:              routeId,
      departure_time:        dep,
      expected_arrival_time: sameDay ? arrTime : null,
      same_day_arrival:      sameDay,
      slot_date:             slotDate,
      slot_status:           'Open',
    });

    if (error) { skipped++; } else { created++; }
  }

  return { created, skipped };
}
