/**
 * Modelo de dominio de red. Los tipos canónicos viven en @diktya-atlas/shared
 * (compartidos con el frontend); este módulo es el punto de entrada dentro
 * del backend para que integraciones/servicios no importen directo del
 * paquete compartido en todos lados.
 */
export {
  NetworkNodeSchema,
  WifiNetworkSchema,
  AlertSchema,
  AlertSeveritySchema,
  NodeStatusSchema,
  type NetworkNode,
  type WifiNetwork,
  type Alert,
  type AlertSeverity,
  type NodeStatus,
} from "@diktya-atlas/shared";
