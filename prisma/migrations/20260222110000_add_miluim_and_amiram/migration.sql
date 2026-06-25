-- CreateEnum
CREATE TYPE "MiluimGroup" AS ENUM ('NONE', 'GROUP_A', 'GROUP_B', 'GROUP_C', 'GROUP_G');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "miluimGroup" "MiluimGroup" NOT NULL DEFAULT 'NONE';
ALTER TABLE "users" ADD COLUMN "miluimCreditsUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "amiramScore" INTEGER;
