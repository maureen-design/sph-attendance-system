-- AlterTable
ALTER TABLE "InviteLink" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "usedBy" TEXT[] DEFAULT ARRAY[]::TEXT[];
