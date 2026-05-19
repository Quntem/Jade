/*
  Warnings:

  - Added the required column `name` to the `enrollment_tokens` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "enrollment_tokens" ADD COLUMN     "description" TEXT,
ADD COLUMN     "name" TEXT NOT NULL;
