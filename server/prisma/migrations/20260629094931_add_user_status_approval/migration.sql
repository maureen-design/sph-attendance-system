-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'INACTIVE');

-- AlterTable: add new columns
ALTER TABLE "User" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'PENDING_APPROVAL';
ALTER TABLE "User" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "User" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "rejectionReason" TEXT;

-- Migrate existing rows: set status = ACTIVE where isActive = true
UPDATE "User" SET "status" = 'ACTIVE' WHERE "isActive" = true;

-- Drop the old isActive column
ALTER TABLE "User" DROP COLUMN "isActive";

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
