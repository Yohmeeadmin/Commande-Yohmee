import { UserRole } from '@/types/auth';
import { useUser } from '@/contexts/UserContext';

// ─── Toutes les permissions granulaires ───────────────────────────────────────

export type Permission =
  // Dashboard
  | 'dashboard.view_financials'
  // Clients
  | 'clients.create'
  | 'clients.edit'
  | 'clients.delete'
  | 'clients.manage_prices'
  // Catalogue
  | 'catalogue.create'
  | 'catalogue.edit'
  | 'catalogue.delete'
  // Commandes
  | 'commandes.create'
  | 'commandes.edit'
  | 'commandes.delete'
  | 'commandes.change_status'
  // Récurrences
  | 'recurrences.create'
  | 'recurrences.edit'
  | 'recurrences.delete'
  | 'recurrences.toggle'
  // Livraisons
  | 'livraisons.assign_driver'
  | 'livraisons.generate_bl'
  | 'livraisons.print_bl'
  | 'livraisons.confirm_delivery'
  | 'livraisons.create_route'
  | 'livraisons.cancel_route'
  // Rapports
  | 'rapports.view_financials'
  | 'rapports.edit_bl'
  | 'rapports.delete_bl'
  | 'rapports.manage_commissions'
  // Paramètres
  | 'parametres.manage_users'
  | 'parametres.manage_settings';

// ─── Permissions par rôle ─────────────────────────────────────────────────────

const ALL_PERMISSIONS: Permission[] = [
  'dashboard.view_financials',
  'clients.create', 'clients.edit', 'clients.delete', 'clients.manage_prices',
  'catalogue.create', 'catalogue.edit', 'catalogue.delete',
  'commandes.create', 'commandes.edit', 'commandes.delete', 'commandes.change_status',
  'recurrences.create', 'recurrences.edit', 'recurrences.delete', 'recurrences.toggle',
  'livraisons.assign_driver', 'livraisons.generate_bl', 'livraisons.print_bl',
  'livraisons.confirm_delivery', 'livraisons.create_route', 'livraisons.cancel_route',
  'rapports.view_financials', 'rapports.edit_bl', 'rapports.delete_bl', 'rapports.manage_commissions',
  'parametres.manage_users', 'parametres.manage_settings',
];

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: ALL_PERMISSIONS,

  direction: [
    'dashboard.view_financials',
    'clients.create', 'clients.edit', 'clients.delete', 'clients.manage_prices',
    'catalogue.create', 'catalogue.edit',
    'commandes.create', 'commandes.edit', 'commandes.delete', 'commandes.change_status',
    'recurrences.create', 'recurrences.edit', 'recurrences.delete', 'recurrences.toggle',
    'livraisons.assign_driver', 'livraisons.generate_bl', 'livraisons.print_bl',
    'livraisons.confirm_delivery', 'livraisons.create_route',
    'rapports.view_financials', 'rapports.edit_bl',
    'rapports.manage_commissions',
  ],

  commercial: [
    'clients.create', 'clients.edit',
    'catalogue.create',
    'commandes.create', 'commandes.edit', 'commandes.change_status',
    'recurrences.create', 'recurrences.edit', 'recurrences.toggle',
  ],

  production: [],

  livraison: [
    'livraisons.confirm_delivery',
  ],

  boulangerie:  [],
  patisserie:   [],
  chocolaterie: [],
  traiteur:     [],
  autre:        [],
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePermissions() {
  const { profile } = useUser();

  function can(permission: Permission): boolean {
    if (!profile) return false;
    return ROLE_PERMISSIONS[profile.role]?.includes(permission) ?? false;
  }

  return { can };
}
