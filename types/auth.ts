export type UserRole =
  | 'admin' | 'direction' | 'commercial' | 'production'
  | 'livraison' | 'boulangerie' | 'patisserie'
  | 'chocolaterie' | 'traiteur' | 'autre';

export type AppModule =
  | 'dashboard' | 'catalogue' | 'clients' | 'commandes'
  | 'recurrences' | 'planning' | 'production'
  | 'livraisons' | 'rapports' | 'parametres';

export interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  modules: AppModule[];
  ateliers: string[]; // [] = tous les ateliers
  driver_id: string | null;
  created_at: string;
}

export const ROLES: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Administrateur' },
  { value: 'direction', label: 'Direction' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'production', label: 'Production' },
  { value: 'livraison', label: 'Livraison' },
  { value: 'boulangerie', label: 'Boulangerie' },
  { value: 'patisserie', label: 'Pâtisserie' },
  { value: 'chocolaterie', label: 'Chocolaterie' },
  { value: 'traiteur', label: 'Traiteur' },
  { value: 'autre', label: 'Autre' },
];

export const ALL_MODULES: { value: AppModule; label: string; href: string }[] = [
  { value: 'dashboard',    label: 'Dashboard',    href: '/' },
  { value: 'catalogue',    label: 'Catalogue',    href: '/catalogue' },
  { value: 'clients',      label: 'Clients',      href: '/clients' },
  { value: 'commandes',    label: 'Commandes',    href: '/commandes' },
  { value: 'recurrences',  label: 'Récurrences',  href: '/recurrences' },
  { value: 'planning',     label: 'Planning',     href: '/planning' },
  { value: 'production',   label: 'Production',   href: '/production' },
  { value: 'livraisons',   label: 'Livraisons',   href: '/livraisons' },
  { value: 'rapports',     label: 'Rapports',     href: '/rapports' },
  { value: 'parametres',   label: 'Paramètres',   href: '/parametres' },
];

export const ROLE_DEFAULT_MODULES: Record<UserRole, AppModule[]> = {
  admin:        ['dashboard', 'catalogue', 'clients', 'commandes', 'recurrences', 'planning', 'production', 'livraisons', 'rapports', 'parametres'],
  direction:    ['dashboard', 'catalogue', 'clients', 'commandes', 'recurrences', 'planning', 'production', 'livraisons', 'rapports'],
  commercial:   ['dashboard', 'clients', 'commandes', 'recurrences', 'catalogue'],
  production:   ['dashboard', 'production', 'planning'],
  livraison:    ['dashboard', 'livraisons', 'planning'],
  boulangerie:  ['dashboard', 'production', 'planning'],
  patisserie:   ['dashboard', 'production', 'planning'],
  chocolaterie: ['dashboard', 'production', 'planning'],
  traiteur:     ['dashboard', 'production', 'planning'],
  autre:        ['dashboard'],
};
