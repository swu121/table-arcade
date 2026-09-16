-- Archiving a venue, from the admin page. There is no delete: a restaurant
-- that stops has floor plans, tickets, paired tablets and staff accounts worth
-- keeping, and a slug worth never handing to anyone else. An archived venue is
-- refused at the handshake like a slug nobody set up, and the bare URL skips it.
ALTER TABLE venues ADD COLUMN archived boolean NOT NULL DEFAULT false;
