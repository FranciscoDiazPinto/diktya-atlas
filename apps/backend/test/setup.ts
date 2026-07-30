import "dotenv/config";

/**
 * Los tests nunca deben poder tocar infraestructura real, sin importar lo
 * que diga el `.env` local del desarrollador en ese momento (ej. alguien
 * probando UNIFI_MODE=live a mano). Se fuerza acá, después de cargar
 * dotenv, para que ningún test dependa de recordar volver a poner mock
 * antes de correr la suite.
 */
process.env.UNIFI_MODE = "mock";
process.env.OPNSENSE_MODE = "mock";
