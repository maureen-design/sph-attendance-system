-- AlterTable: add foreign key for Leave.decidedBy -> User.id
ALTER TABLE "Leave" ADD CONSTRAINT "Leave_decidedBy_fkey" FOREIGN KEY ("decidedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
