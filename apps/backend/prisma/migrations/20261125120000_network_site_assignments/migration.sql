CREATE TABLE "network_site_assignments" (
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "sitio" TEXT NOT NULL,
  PRIMARY KEY ("userId", "sitio")
);
