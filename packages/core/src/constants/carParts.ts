export const CAR_PARTS = [
  'chassi',
  'motor',
  'asaDianteira',
  'asaTraseira',
  'suspensao',
  'freios',
  'cambio'
] as const;

export type CarPart = typeof CAR_PARTS[number];

export const CAR_PART_LABELS: Record<CarPart, string> = {
  chassi: 'Chassi',
  motor: 'Motor',
  asaDianteira: 'Asa dianteira',
  asaTraseira: 'Asa traseira',
  suspensao: 'Suspensão',
  freios: 'Freios',
  cambio: 'Câmbio'
};

export const SETUP_PARAMETERS = [
  'asas',
  'motor',
  'freios',
  'cambio',
  'suspensao'
] as const;

export type SetupParameter = typeof SETUP_PARAMETERS[number];

export interface CarSetup {
  asas: number;
  motor: number;
  freios: number;
  cambio: number;
  suspensao: number;
}
