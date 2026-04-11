# BDK Commandes - Plan Fonctionnel

## 1. RÉSUMÉ DU BESOIN

Application web de gestion des commandes pour un laboratoire de production pâtisserie/boulangerie.
- **Objectif** : Outil simple, rapide, utilisable au quotidien par une petite équipe
- **Utilisateurs** : Équipe de production BDK (3-10 personnes)
- **Usage** : Bureau, labo, cuisine (desktop + mobile)

---

## 2. MODULES DE L'APPLICATION

### Module 1 : Dashboard
Page d'accueil avec vue d'ensemble rapide

### Module 2 : Catalogue Produits
Gestion des produits et catégories

### Module 3 : Clients
Gestion des clients B2B et particuliers

### Module 4 : Commandes
Création, suivi et gestion des commandes

### Module 5 : Récurrences
Commandes automatiques récurrentes par client

### Module 6 : Planning & Production
Vue calendrier et agrégation production

---

## 3. ARBORESCENCE DES PAGES

```
/                           → Dashboard
/catalogue                  → Liste des produits
/catalogue/nouveau          → Créer un produit
/catalogue/[id]             → Modifier un produit
/clients                    → Liste des clients
/clients/nouveau            → Créer un client
/clients/[id]               → Fiche client détaillée
/commandes                  → Liste des commandes
/commandes/nouvelle         → Créer une commande
/commandes/[id]             → Détail commande
/recurrences                → Liste des commandes récurrentes
/recurrences/nouvelle       → Créer une récurrence
/recurrences/[id]           → Modifier une récurrence
/planning                   → Vue calendrier/semaine
/production                 → Vue production du jour
```

---

## 4. SCHÉMA BASE DE DONNÉES

### Table: categories
| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid | PK |
| nom | text | Nom catégorie |
| ordre | int | Ordre d'affichage |
| created_at | timestamp | |

**Catégories initiales** : Pâtisserie, Boulangerie, Viennoiserie, Chocolaterie, Snack, Traiteur

---

### Table: products
| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid | PK |
| reference | text | Référence produit (unique) |
| nom | text | Nom du produit |
| category_id | uuid | FK → categories |
| description | text | Description courte |
| prix | decimal | Prix unitaire |
| unite | text | 'pièce', 'kg', 'lot', etc. |
| delai_preparation | int | Délai en heures |
| note_production | text | Note interne |
| is_frequent | boolean | Produit souvent commandé |
| is_active | boolean | Actif/Inactif |
| created_at | timestamp | |
| updated_at | timestamp | |

---

### Table: clients
| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid | PK |
| nom | text | Nom société/client |
| contact_nom | text | Nom du contact |
| telephone | text | |
| email | text | |
| adresse | text | Adresse principale |
| adresse_livraison | text | Adresse de livraison |
| type_client | text | 'hotel', 'restaurant', 'cafe', 'riad', 'particulier', 'autre' |
| jours_livraison | text[] | ['lundi', 'mercredi', 'vendredi'] |
| horaire_livraison | text | '08:00-10:00' |
| note_interne | text | Remarques |
| is_active | boolean | |
| created_at | timestamp | |
| updated_at | timestamp | |

---

### Table: orders
| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid | PK |
| numero | text | Numéro commande (auto) |
| client_id | uuid | FK → clients |
| date_livraison | date | Date de livraison |
| heure_livraison | time | Heure souhaitée |
| statut | text | 'brouillon', 'confirmee', 'production', 'livree', 'annulee' |
| note | text | Note générale |
| total | decimal | Total calculé |
| recurring_order_id | uuid | FK → recurring_orders (si généré depuis récurrence) |
| created_at | timestamp | |
| updated_at | timestamp | |

---

### Table: order_items
| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid | PK |
| order_id | uuid | FK → orders |
| product_id | uuid | FK → products |
| quantite | decimal | Quantité commandée |
| prix_unitaire | decimal | Prix au moment de la commande |
| note | text | Note ligne |
| created_at | timestamp | |

---

### Table: recurring_orders
| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid | PK |
| client_id | uuid | FK → clients |
| nom | text | Nom de la récurrence |
| type_recurrence | text | 'quotidien', 'hebdo', 'personnalise' |
| jours_semaine | text[] | ['lundi', 'mercredi'] si hebdo |
| heure_livraison | time | |
| date_debut | date | |
| date_fin | date | Optionnel |
| is_active | boolean | |
| note | text | |
| created_at | timestamp | |
| updated_at | timestamp | |

---

### Table: recurring_order_items
| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid | PK |
| recurring_order_id | uuid | FK → recurring_orders |
| product_id | uuid | FK → products |
| quantite | decimal | |
| note | text | |
| created_at | timestamp | |

---

## 5. STATUTS COMMANDES

| Statut | Couleur | Description |
|--------|---------|-------------|
| brouillon | Gris | En cours de création |
| confirmee | Bleu | Validée, à produire |
| production | Orange | En cours de production |
| livree | Vert | Livrée |
| annulee | Rouge | Annulée |

---

## 6. TYPES CLIENTS

- Hotel
- Restaurant
- Café
- Riad
- Particulier
- Autre

---

## 7. FONCTIONNALITÉS PRIORITAIRES V1

### Must-have
- [ ] CRUD Produits avec catégories
- [ ] CRUD Clients
- [ ] Création commande rapide
- [ ] Liste commandes avec filtres
- [ ] Commandes récurrentes
- [ ] Génération commande depuis récurrence
- [ ] Vue production du jour (agrégation)
- [ ] Dashboard avec commandes du jour

### Nice-to-have (V1.1)
- [ ] Duplication commande
- [ ] Export PDF bon de commande
- [ ] Export PDF production du jour
- [ ] Vue calendrier semaine
- [ ] Recherche globale

### V2
- [ ] Multi-utilisateurs avec rôles
- [ ] Historique modifications
- [ ] Statistiques ventes
- [ ] Facturation

---

## 8. STRUCTURE DES DOSSIERS

```
commande bdk/
├── app/
│   ├── layout.tsx              # Layout principal avec sidebar
│   ├── page.tsx                # Dashboard
│   ├── catalogue/
│   │   ├── page.tsx            # Liste produits
│   │   ├── nouveau/page.tsx    # Créer produit
│   │   └── [id]/page.tsx       # Modifier produit
│   ├── clients/
│   │   ├── page.tsx            # Liste clients
│   │   ├── nouveau/page.tsx    # Créer client
│   │   └── [id]/page.tsx       # Fiche client
│   ├── commandes/
│   │   ├── page.tsx            # Liste commandes
│   │   ├── nouvelle/page.tsx   # Créer commande
│   │   └── [id]/page.tsx       # Détail commande
│   ├── recurrences/
│   │   ├── page.tsx            # Liste récurrences
│   │   ├── nouvelle/page.tsx   # Créer récurrence
│   │   └── [id]/page.tsx       # Modifier récurrence
│   ├── planning/
│   │   └── page.tsx            # Vue calendrier
│   └── production/
│       └── page.tsx            # Vue production jour
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── MobileNav.tsx
│   ├── ui/                     # Composants shadcn
│   ├── catalogue/
│   │   ├── ProductCard.tsx
│   │   ├── ProductForm.tsx
│   │   └── CategoryFilter.tsx
│   ├── clients/
│   │   ├── ClientCard.tsx
│   │   └── ClientForm.tsx
│   ├── commandes/
│   │   ├── OrderCard.tsx
│   │   ├── OrderForm.tsx
│   │   ├── OrderLineItem.tsx
│   │   └── StatusBadge.tsx
│   ├── recurrences/
│   │   ├── RecurrenceCard.tsx
│   │   └── RecurrenceForm.tsx
│   └── production/
│       ├── ProductionList.tsx
│       └── ProductionItem.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── products.ts
│   │   ├── clients.ts
│   │   ├── orders.ts
│   │   └── recurring.ts
│   ├── utils.ts
│   └── constants.ts
├── types/
│   └── index.ts                # Types TypeScript
└── hooks/
    ├── useProducts.ts
    ├── useClients.ts
    ├── useOrders.ts
    └── useRecurring.ts
```

---

## 9. DESIGN SYSTEM

### Couleurs
- **Primary** : #2563EB (Bleu)
- **Success** : #10B981 (Vert)
- **Warning** : #F59E0B (Orange)
- **Danger** : #EF4444 (Rouge)
- **Neutral** : #6B7280 (Gris)
- **Background** : #F9FAFB
- **Card** : #FFFFFF

### Composants UI
- Sidebar fixe à gauche (240px desktop, drawer mobile)
- Header avec recherche et actions rapides
- Cards avec ombres légères
- Boutons larges pour actions principales
- Badges colorés pour statuts
- Tables responsives avec actions inline

### Responsive
- Desktop : Sidebar visible, tables complètes
- Tablet : Sidebar collapsible, cards adaptées
- Mobile : Bottom nav ou drawer, cards empilées

---

## 10. WORKFLOW COMMANDE RÉCURRENTE

1. **Création récurrence**
   - Sélectionner client
   - Définir jours (lundi, mercredi...)
   - Ajouter produits + quantités
   - Définir heure livraison
   - Activer

2. **Génération quotidienne**
   - Dashboard affiche "Récurrences du jour"
   - Bouton "Générer les commandes"
   - Crée les commandes en statut "confirmee"
   - Lien vers récurrence d'origine conservé

3. **Modification ponctuelle**
   - Modifier la commande générée (pas la récurrence)
   - La récurrence reste intacte

4. **Suspension**
   - Désactiver temporairement une récurrence
   - Réactiver quand nécessaire

---

## 11. PROCHAINE ÉTAPE

Je vais maintenant créer :
1. Le script SQL Supabase complet
2. Les types TypeScript
3. Le layout principal avec sidebar
4. Les pages principales une par une

Confirme si ce plan te convient ou si tu veux modifier quelque chose avant que je commence le code.
