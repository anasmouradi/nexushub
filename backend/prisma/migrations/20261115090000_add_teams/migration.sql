CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_members" (
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("teamId", "userId")
);

CREATE UNIQUE INDEX "teams_companyId_name_key" ON "teams"("companyId", "name");
CREATE INDEX "teams_companyId_idx" ON "teams"("companyId");
CREATE INDEX "team_members_userId_idx" ON "team_members"("userId");

ALTER TABLE "teams"
ADD CONSTRAINT "teams_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "teams"
ADD CONSTRAINT "teams_managerId_fkey"
FOREIGN KEY ("managerId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "team_members"
ADD CONSTRAINT "team_members_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "teams"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "team_members"
ADD CONSTRAINT "team_members_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
