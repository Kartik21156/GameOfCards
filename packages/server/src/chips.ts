import { db } from './db.ts';

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Change a user's balance and log it. Throws if the balance would go negative. */
export async function adjustChips(tx: Tx, userId: string, amount: number, reason: string): Promise<number> {
  const user = await tx.user.update({ where: { id: userId }, data: { chips: { increment: amount } } });
  if (user.chips < 0) throw new InsufficientChips(user.displayName);
  await tx.chipTransaction.create({ data: { userId, amount, reason, balance: user.chips } });
  return user.chips;
}

export class InsufficientChips extends Error {
  constructor(public who: string) {
    super(`${who} does not have enough chips`);
  }
}
