export type ComponentControl = {
  name: string;
  label: string;
  type: 'number' | 'select' | 'text' | 'boolean' | 'color';
  defaultValue: number | string | boolean;
  description?: string;
  target?: 'style' | 'content' | 'preview';
  multiline?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
};

export type ComponentMetadata = {
  slug: string;
  name: string;
  family: {
    slug: string;
    name: string;
  };
  description: string;
  access: 'free' | 'pro';
  visibility: 'catalog' | 'hidden';
  featured: boolean;
  styles: string[];
  types: string[];
  interactions: string[];
  technologies: string[];
  scopes: string[];
  compatibility: string[];
  dependencies: string[];
  controls: ComponentControl[];
} & (
  | { status: 'draft'; version?: string; drop?: number; publishedAt?: string }
  | { status: 'published'; version: string; drop: number; publishedAt: string }
);
