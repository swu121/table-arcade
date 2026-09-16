// A ticket in the room is what the staff screen has always been sent:
//
//   { id, item, owingTable, owedToTable, status: 'pending' | 'delivered',
//     createdAt, deliveredAt?, gameId, gameName, reason }
//
// A row is the same fact in the database's words. The two only meet here, so
// nothing the client receives changes shape because a database appeared.

export function toRow(slug, ticket) {
  return {
    id: ticket.id,
    venue_slug: slug,
    from_table: ticket.owingTable,
    to_table: ticket.owedToTable,
    item: ticket.item,
    price: Number(ticket.item?.price ?? 0),
    kind: ticket.reason === 'gift' ? 'gift' : 'wager',
    status: ticket.status === 'delivered' ? 'delivered' : 'open',
    game_id: ticket.gameId ?? null,
    game_name: ticket.gameName ?? null,
    reason: ticket.reason ?? null,
    created_at: new Date(ticket.createdAt),
    delivered_at: ticket.deliveredAt ? new Date(ticket.deliveredAt) : null
  }
}

export function fromRow(row) {
  const ticket = {
    id: row.id,
    item: row.item,
    owingTable: row.from_table,
    owedToTable: row.to_table,
    status: row.status === 'delivered' ? 'delivered' : 'pending',
    createdAt: new Date(row.created_at).getTime(),
    gameId: row.game_id ?? null,
    gameName: row.game_name ?? null,
    reason: row.reason ?? (row.kind === 'gift' ? 'gift' : null)
  }
  if (row.delivered_at) ticket.deliveredAt = new Date(row.delivered_at).getTime()
  return ticket
}

// Defensive copy for the in-memory backends, so a room mutating its ticket
// doesn't silently mutate the "stored" one too.
export const clone = (ticket) => structuredClone(ticket)
