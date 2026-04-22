export type ParameterType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'string[]'
  | 'number[]'
  | 'boolean[]';

export type ParameterValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | boolean[];

export type ParameterOption = {
  value: string | number;
  label: string;
};

export type ParameterRange = {
  min?: number;
  max?: number;
  step?: number;
};

export type Parameter = {
  name: string;
  displayName: string;
  value: ParameterValue;
  defaultValue: ParameterValue;
  type: ParameterType;
  description?: string;
  range?: ParameterRange;
  options?: ParameterOption[];
};

export type GenerateResponse = {
  prompt: string;
  code: string;
};

