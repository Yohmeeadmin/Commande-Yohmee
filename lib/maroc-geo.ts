export const VILLES_MAROC = [
  'Agadir', 'Aïn Chock', 'Aïn Sebaa', 'Al Hoceïma', 'Azemmour', 'Azemour',
  'Azilal', 'Azrou', 'Beni Mellal', 'Berkane', 'Berrechid', 'Boujdour',
  'Bouskoura', 'Bouznika', 'Casablanca', 'Chefchaouen', 'Dakhla', 'El Hajeb',
  'El Jadida', 'El Kelaa des Sraghna', 'Errachidia', 'Essaouira', 'Fès',
  'Figuig', 'Fnideq', 'Guelmim', 'Guercif', 'Ifrane', 'Inezgane', 'Jorf el Melha',
  'Kénitra', 'Khemisset', 'Khenifra', 'Khouribga', 'Laâyoune', 'Larache',
  'Lqliâa', 'Marrakech', 'Martil', 'Meknès', 'Midelt', 'Mohammedia',
  'Nador', 'Ouarzazate', 'Oued Zem', 'Oujda', 'Rabat', 'Safi',
  'Salé', 'Sefrou', 'Settat', 'Sidi Ifni', 'Sidi Kacem', 'Sidi Slimane',
  'Skhirat', 'Smara', 'Sousse', 'Tanger', 'Tan-Tan', 'Taounate', 'Taourirt',
  'Taroudant', 'Taza', 'Tétouan', 'Tiznit', 'Youssoufia', 'Zagora',
].sort();

export const QUARTIERS_PAR_VILLE: Record<string, string[]> = {
  Marrakech: [
    'Médina',
    'Guéliz',
    'Hivernage',
    'Palmeraie',
    'Agdal',
    'Ménara',
    'Mhamid',
    'Massira',
    'Hay Hassani',
    'Azli',
    'Targa',
    'Sidi Youssef Ben Ali',
    'Route de Casablanca',
    'Route de Safi',
    'Izdihar',
    'Aouatif',
    'Hay Charaf',
    'Sidi Ghanem',
  ],
  Casablanca: [
    'Aïn Chock', 'Aïn Diab', 'Aïn Sebaa', 'Anfa', 'Beausejour',
    'Ben M\'sick', 'Bernoussi', 'Bourgogne', 'CIL', 'Derb Omar',
    'Derb Sultan', 'Gauthier', 'Hay Hassani', 'Hay Mohammadi', 'Lydec',
    'Maârif', 'Mers Sultan', 'Oasis', 'Sbata', 'Sidi Bernoussi',
    'Sidi Moumen', 'Ain Sebaa', 'Val Fleuri',
  ],
  Rabat: [
    'Agdal', 'Aviation', 'Hassan', 'Hay Riad', 'Médina', 'Océan',
    'Orangers', 'Souissi', 'Takaddoum', 'Yacoub El Mansour',
  ],
  Fès: [
    'Aïn Chkef', 'Bensouda', 'Jdid', 'Médina (Fès el Bali)', 'Narjiss',
    'Saiss', 'Ville Nouvelle', 'Zouagha',
  ],
  Tanger: [
    'Aïn Khabbaz', 'Boukhalef', 'Centre ville', 'Charf', 'Dradeb',
    'Iberia', 'Médina', 'Mesnana', 'Moujahidine', 'Val Fleuri',
  ],
  Agadir: [
    'Agadir Oufella', 'Anza', 'Founty', 'Hay Mohammadi', 'Inezgane',
    'Nouveau Talborjt', 'Secteur Balnéaire', 'Talborjt', 'Tilila',
  ],
  Meknès: [
    'Hamria', 'Hay Salam', 'Médina', 'Nouvelle ville', 'Rouamzine',
    'Zitoune',
  ],
};
