import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Conditional classes with later Tailwind utilities winning. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export default cn;
