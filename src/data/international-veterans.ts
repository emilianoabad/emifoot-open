import type { Position } from '../game/types'

/**
 * Real-player identity pool curated on 2026-09-28 for the 2026 career snapshot.
 * Birth years and nationalities come from the sources named beside each group.
 * Names use familiar football names; positions use the game's four-role system.
 * Strengths and future returns to Brazil are fictional gameplay values. This is
 * not a live transfer list and makes no claim about a player's current club.
 * Younger real players remain in the pool so they can age into veteran eligibility.
 * Domestic and invited Libertadores roster identities are excluded. The 2026
 * identity review also excludes Brazil-based Memphis Depay, Kaio César (the
 * bundled Corinthians "Kaio") and Rodrigo Rodrigues, despite older overseas lists.
 *
 * FIFA 2022: https://fdp.fifa.org/assetspublic/ce44/pdf/SquadLists-English.pdf
 * FIFA 2025: https://fdp.fifa.org/assetspublic/ce233/pdf/SquadLists-English.pdf
 */
interface RealVeteran {
  id: string
  name: string
  birthYear: number
  nationality: string
  position: Position
  strength: number
}

export const REAL_VETERANS: readonly RealVeteran[] = [
  // FIFA World Cup 2022, Brazil squad (page 4).
  { id: 'alisson-becker-1992', name: 'Alisson Becker', birthYear: 1992, nationality: 'BRA', position: 'G', strength: 47 },
  { id: 'ederson-1993', name: 'Ederson', birthYear: 1993, nationality: 'BRA', position: 'G', strength: 46 },
  { id: 'marquinhos-1994', name: 'Marquinhos', birthYear: 1994, nationality: 'BRA', position: 'D', strength: 46 },
  { id: 'eder-militao-1998', name: 'Éder Militão', birthYear: 1998, nationality: 'BRA', position: 'D', strength: 45 },
  { id: 'bremer-1997', name: 'Bremer', birthYear: 1997, nationality: 'BRA', position: 'D', strength: 44 },
  { id: 'casemiro-1992', name: 'Casemiro', birthYear: 1992, nationality: 'BRA', position: 'M', strength: 45 },
  { id: 'fred-1993', name: 'Fred', birthYear: 1993, nationality: 'BRA', position: 'M', strength: 40 },
  { id: 'fabinho-tavares-1993', name: 'Fabinho Tavares', birthYear: 1993, nationality: 'BRA', position: 'M', strength: 43 },
  { id: 'bruno-guimaraes-1997', name: 'Bruno Guimarães', birthYear: 1997, nationality: 'BRA', position: 'M', strength: 46 },
  { id: 'gabriel-jesus-1997', name: 'Gabriel Jesus', birthYear: 1997, nationality: 'BRA', position: 'A', strength: 44 },
  { id: 'richarlison-1997', name: 'Richarlison', birthYear: 1997, nationality: 'BRA', position: 'A', strength: 43 },
  { id: 'raphinha-1996', name: 'Raphinha', birthYear: 1996, nationality: 'BRA', position: 'A', strength: 47 },
  { id: 'antony-2000', name: 'Antony', birthYear: 2000, nationality: 'BRA', position: 'A', strength: 41 },
  { id: 'vinicius-junior-2000', name: 'Vinícius Júnior', birthYear: 2000, nationality: 'BRA', position: 'A', strength: 48 },
  { id: 'rodrygo-2001', name: 'Rodrygo', birthYear: 2001, nationality: 'BRA', position: 'A', strength: 46 },
  { id: 'gabriel-martinelli-2001', name: 'Gabriel Martinelli', birthYear: 2001, nationality: 'BRA', position: 'A', strength: 44 },

  // FIFA Club World Cup 2025: Brazilian players in international club squads.
  { id: 'erik-menezes-2001', name: 'Erik Menezes', birthYear: 2001, nationality: 'BRA', position: 'D', strength: 35 },
  { id: 'marcos-leonardo-2003', name: 'Marcos Leonardo', birthYear: 2003, nationality: 'BRA', position: 'A', strength: 41 },
  { id: 'malcom-1997', name: 'Malcom', birthYear: 1997, nationality: 'BRA', position: 'A', strength: 42 },
  { id: 'yan-couto-2002', name: 'Yan Couto', birthYear: 2002, nationality: 'BRA', position: 'D', strength: 40 },
  { id: 'eduardo-bauermann-1996', name: 'Eduardo Bauermann', birthYear: 1996, nationality: 'BRA', position: 'D', strength: 35 },
  { id: 'kenedy-1996', name: 'Kenedy', birthYear: 1996, nationality: 'BRA', position: 'A', strength: 36 },
  { id: 'andrey-santos-2004', name: 'Andrey Santos', birthYear: 2004, nationality: 'BRA', position: 'M', strength: 42 },
  { id: 'joao-pedro-2001', name: 'João Pedro', birthYear: 2001, nationality: 'BRA', position: 'A', strength: 44 },
  { id: 'yan-sasse-1997', name: 'Yan Sasse', birthYear: 1997, nationality: 'BRA', position: 'M', strength: 35 },
  // Luís Henrique Tomaz de Lima (Inter), distinct from Luiz Henrique André Rosa da Silva.
  { id: 'luis-henrique-2001', name: 'Luís Henrique', birthYear: 2001, nationality: 'BRA', position: 'A', strength: 39 },
  { id: 'carlos-augusto-1999', name: 'Carlos Augusto', birthYear: 1999, nationality: 'BRA', position: 'D', strength: 40 },
  { id: 'otavio-ataide-2002', name: 'Otávio Ataíde', birthYear: 2002, nationality: 'BRA', position: 'D', strength: 38 },
  { id: 'william-gomes-2006', name: 'William Gomes', birthYear: 2006, nationality: 'BRA', position: 'A', strength: 39 },
  { id: 'pepe-1997', name: 'Pepê', birthYear: 1997, nationality: 'BRA', position: 'A', strength: 40 },
  { id: 'leo-afonso-2001', name: 'Léo Afonso', birthYear: 2001, nationality: 'BRA', position: 'A', strength: 35 },
  { id: 'douglas-luiz-1998', name: 'Douglas Luiz', birthYear: 1998, nationality: 'BRA', position: 'M', strength: 43 },
  { id: 'igor-jesus-lima-2003', name: 'Igor Jesus Lima', birthYear: 2003, nationality: 'BRA', position: 'M', strength: 36 },
  { id: 'arthur-sales-2002', name: 'Arthur Sales', birthYear: 2002, nationality: 'BRA', position: 'A', strength: 36 },
  { id: 'vitor-reis-2006', name: 'Vitor Reis', birthYear: 2006, nationality: 'BRA', position: 'D', strength: 40 },
  { id: 'savinho-2004', name: 'Savinho', birthYear: 2004, nationality: 'BRA', position: 'A', strength: 43 },
  { id: 'lucas-beraldo-2003', name: 'Lucas Beraldo', birthYear: 2003, nationality: 'BRA', position: 'D', strength: 40 },
  { id: 'gabriel-moscardo-2005', name: 'Gabriel Moscardo', birthYear: 2005, nationality: 'BRA', position: 'M', strength: 38 },
  { id: 'endrick-2006', name: 'Endrick', birthYear: 2006, nationality: 'BRA', position: 'A', strength: 43 },
  { id: 'erick-farias-1997', name: 'Erick Farias', birthYear: 1997, nationality: 'BRA', position: 'A', strength: 35 },
  { id: 'yago-cariello-1999', name: 'Yago Cariello', birthYear: 1999, nationality: 'BRA', position: 'A', strength: 35 },
  { id: 'danilo-boza-1998', name: 'Danilo Boza', birthYear: 1998, nationality: 'BRA', position: 'D', strength: 36 },
  { id: 'matheus-savio-1997', name: 'Matheus Sávio', birthYear: 1997, nationality: 'BRA', position: 'M', strength: 37 },
  { id: 'thiago-santana-1993', name: 'Thiago Santana', birthYear: 1993, nationality: 'BRA', position: 'A', strength: 36 },
  { id: 'guilherme-ferreira-1999', name: 'Guilherme Ferreira', birthYear: 1999, nationality: 'BRA', position: 'D', strength: 35 },

  // Additional Brazilian identities: official club profiles (birth year/nationality).
  // https://www.chelseafc.com/en/teams/profile/estevao
  { id: 'estevao-willian-2007', name: 'Estêvão Willian', birthYear: 2007, nationality: 'BRA', position: 'A', strength: 44 },
  // https://www.manutd.com/en/teams/mens-team/matheus-cunha
  { id: 'matheus-cunha-1999', name: 'Matheus Cunha', birthYear: 1999, nationality: 'BRA', position: 'A', strength: 44 },
  // https://soccerschools.liverpoolfc.com/team/first-team/player/roberto-firmino
  { id: 'roberto-firmino-1991', name: 'Roberto Firmino', birthYear: 1991, nationality: 'BRA', position: 'A', strength: 43 },

  // FIFA World Cup 2022, respective national squads.
  { id: 'antoine-griezmann-1991', name: 'Antoine Griezmann', birthYear: 1991, nationality: 'FRA', position: 'A', strength: 46 },
  { id: 'harry-kane-1993', name: 'Harry Kane', birthYear: 1993, nationality: 'ENG', position: 'A', strength: 48 },
  { id: 'son-heung-min-1992', name: 'Son Heung-min', birthYear: 1992, nationality: 'KOR', position: 'A', strength: 45 },
  { id: 'paulo-dybala-1993', name: 'Paulo Dybala', birthYear: 1993, nationality: 'ARG', position: 'A', strength: 44 },
  { id: 'lautaro-martinez-1997', name: 'Lautaro Martínez', birthYear: 1997, nationality: 'ARG', position: 'A', strength: 47 },
  { id: 'julian-alvarez-2000', name: 'Julián Álvarez', birthYear: 2000, nationality: 'ARG', position: 'A', strength: 46 },
  { id: 'kylian-mbappe-1998', name: 'Kylian Mbappé', birthYear: 1998, nationality: 'FRA', position: 'A', strength: 48 },
  { id: 'kevin-de-bruyne-1991', name: 'Kevin De Bruyne', birthYear: 1991, nationality: 'BEL', position: 'M', strength: 47 },
  { id: 'bernardo-silva-1994', name: 'Bernardo Silva', birthYear: 1994, nationality: 'POR', position: 'M', strength: 46 },
  { id: 'bruno-fernandes-1994', name: 'Bruno Fernandes', birthYear: 1994, nationality: 'POR', position: 'M', strength: 46 },
  { id: 'ruben-dias-1997', name: 'Rúben Dias', birthYear: 1997, nationality: 'POR', position: 'D', strength: 46 },
  { id: 'joao-cancelo-1994', name: 'João Cancelo', birthYear: 1994, nationality: 'POR', position: 'D', strength: 43 },
  { id: 'romelu-lukaku-1993', name: 'Romelu Lukaku', birthYear: 1993, nationality: 'BEL', position: 'A', strength: 43 },
  { id: 'ousmane-dembele-1997', name: 'Ousmane Dembélé', birthYear: 1997, nationality: 'FRA', position: 'A', strength: 47 },
  { id: 'thibaut-courtois-1992', name: 'Thibaut Courtois', birthYear: 1992, nationality: 'BEL', position: 'G', strength: 47 },
  { id: 'marc-andre-ter-stegen-1992', name: 'Marc-André ter Stegen', birthYear: 1992, nationality: 'GER', position: 'G', strength: 45 },
  { id: 'ilkay-gundogan-1990', name: 'İlkay Gündoğan', birthYear: 1990, nationality: 'GER', position: 'M', strength: 43 },
  { id: 'christian-eriksen-1992', name: 'Christian Eriksen', birthYear: 1992, nationality: 'DEN', position: 'M', strength: 41 },
  { id: 'robert-lewandowski-1988', name: 'Robert Lewandowski', birthYear: 1988, nationality: 'POL', position: 'A', strength: 47 },
  { id: 'achraf-hakimi-1998', name: 'Achraf Hakimi', birthYear: 1998, nationality: 'MAR', position: 'D', strength: 46 },
  { id: 'federico-valverde-1998', name: 'Federico Valverde', birthYear: 1998, nationality: 'URU', position: 'M', strength: 47 },
  { id: 'frenkie-de-jong-1997', name: 'Frenkie de Jong', birthYear: 1997, nationality: 'NED', position: 'M', strength: 45 },
  { id: 'jude-bellingham-2003', name: 'Jude Bellingham', birthYear: 2003, nationality: 'ENG', position: 'M', strength: 48 },

  // FIFA Club World Cup 2025, international club squads.
  { id: 'erling-haaland-2000', name: 'Erling Haaland', birthYear: 2000, nationality: 'NOR', position: 'A', strength: 48 },
  { id: 'khvicha-kvaratskhelia-2001', name: 'Khvicha Kvaratskhelia', birthYear: 2001, nationality: 'GEO', position: 'A', strength: 46 },
  { id: 'desire-doue-2005', name: 'Désiré Doué', birthYear: 2005, nationality: 'FRA', position: 'A', strength: 45 },

  // Official Liverpool profile and UEFA press kit, respectively.
  // https://members.liverpoolfc.com/team/first-team/player/mohamed-salah
  { id: 'mohamed-salah-1992', name: 'Mohamed Salah', birthYear: 1992, nationality: 'EGY', position: 'A', strength: 47 },
  // https://www.uefa.com/news-media/mediaservices/informationkits/competitions/uefachampionsleague/2018/match/2021710/
  { id: 'sadio-mane-1992', name: 'Sadio Mané', birthYear: 1992, nationality: 'SEN', position: 'A', strength: 44 },
]
