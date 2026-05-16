export interface Product {
  id: string;
  name: string;
  maxDays: number;
  yellowDays: number;
  redDays: number;
  isArchived: boolean;
  sortOrder: number;
  category: 'mignon' | 'monoporzione';
  createdAt?: any;
}

export interface Batch {
  id: string;
  productId: string;
  quantity: number;
  entryDate: string;
  createdAt?: any;
}
