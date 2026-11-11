-- Conservar historial de múltiples aplicaciones/liberaciones de una VLAN.
-- Solo una reserva activa puede existir para VLAN+sitio.
DROP INDEX "vlan_reservations_vlanId_sitio_estado_key";
CREATE UNIQUE INDEX "vlan_reservations_active_vlan_site_key" ON "vlan_reservations"("vlanId", "sitio") WHERE "estado" = 'RESERVADA';
CREATE INDEX "vlan_reservations_vlanId_sitio_estado_idx" ON "vlan_reservations"("vlanId", "sitio", "estado");
