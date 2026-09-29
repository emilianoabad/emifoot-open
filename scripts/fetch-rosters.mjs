import { mkdir, writeFile } from 'node:fs/promises'

const SNAPSHOT_ID = 'BRA-2026-08-30-r3'
const FETCHED_AT = '2026-08-30'
const ESPN_ROOT = 'https://site.api.espn.com/apis/site/v2/sports/soccer'

const clubs = [
  ['flamengo', 'Flamengo', 'FLA', 1, 47, 'Rio de Janeiro', 'RJ', 'Maracanã', 78838, '#c00000', '#000000', 'bra.1', '819'],
  ['palmeiras', 'Palmeiras', 'PAL', 1, 46, 'São Paulo', 'SP', 'Allianz Parque', 43713, '#008000', '#ffffff', 'bra.1', '2029'],
  ['sao-paulo', 'São Paulo', 'SAO', 1, 43, 'São Paulo', 'SP', 'MorumBIS', 66795, '#ffffff', '#c00000', 'bra.1', '2026'],
  ['santos', 'Santos', 'SAN', 1, 42, 'Santos', 'SP', 'Vila Belmiro', 16068, '#ffffff', '#000000', 'bra.1', '2674'],
  ['corinthians', 'Corinthians', 'COR', 1, 44, 'São Paulo', 'SP', 'Neo Química Arena', 49205, '#ffffff', '#000000', 'bra.1', '874'],
  ['gremio', 'Grêmio', 'GRE', 1, 42, 'Porto Alegre', 'RS', 'Arena do Grêmio', 55662, '#0080c0', '#000000', 'bra.1', '6273'],
  ['internacional', 'Internacional', 'INT', 1, 43, 'Porto Alegre', 'RS', 'Beira-Rio', 50128, '#c00000', '#ffffff', 'bra.1', '1936'],
  ['cruzeiro', 'Cruzeiro', 'CRU', 1, 41, 'Belo Horizonte', 'MG', 'Mineirão', 61846, '#0000aa', '#ffffff', 'bra.1', '2022'],
  ['atletico-mg', 'Atlético-MG', 'CAM', 2, 44, 'Belo Horizonte', 'MG', 'Arena MRV', 46000, '#000000', '#ffffff', 'bra.1', '7632'],
  ['vasco', 'Vasco da Gama', 'VAS', 2, 40, 'Rio de Janeiro', 'RJ', 'São Januário', 21880, '#000000', '#ffffff', 'bra.1', '3454'],
  ['fluminense', 'Fluminense', 'FLU', 2, 42, 'Rio de Janeiro', 'RJ', 'Maracanã', 78838, '#800020', '#008040', 'bra.1', '3445'],
  ['botafogo', 'Botafogo', 'BOT', 2, 43, 'Rio de Janeiro', 'RJ', 'Nilton Santos', 44661, '#000000', '#ffffff', 'bra.1', '6086'],
  ['athletico-pr', 'Athletico-PR', 'CAP', 2, 41, 'Curitiba', 'PR', 'Arena da Baixada', 42372, '#c00000', '#000000', 'bra.1', '3458'],
  ['bahia', 'Bahia', 'BAH', 2, 41, 'Salvador', 'BA', 'Arena Fonte Nova', 50025, '#0000aa', '#c00000', 'bra.1', '9967'],
  ['sport', 'Sport', 'SPT', 2, 36, 'Recife', 'PE', 'Ilha do Retiro', 26345, '#c00000', '#000000', 'bra.2', '7635'],
  ['coritiba', 'Coritiba', 'CFC', 2, 35, 'Curitiba', 'PR', 'Couto Pereira', 40502, '#008000', '#ffffff', 'bra.1', '3456'],
  ['guarani', 'Guarani', 'GUA', 3, 32, 'Campinas', 'SP', 'Brinco de Ouro', 29130, '#008000', '#ffffff', 'bra.copa_do_brazil', '3448'],
  ['vitoria', 'Vitória', 'VIT', 3, 36, 'Salvador', 'BA', 'Barradão', 30000, '#c00000', '#000000', 'bra.1', '3457'],
  ['fortaleza', 'Fortaleza', 'FOR', 3, 39, 'Fortaleza', 'CE', 'Castelão', 63903, '#0000aa', '#c00000', 'bra.2', '6272'],
  ['ceara', 'Ceará', 'CEA', 3, 35, 'Fortaleza', 'CE', 'Castelão', 63903, '#000000', '#ffffff', 'bra.2', '9969'],
  ['goias', 'Goiás', 'GOI', 3, 34, 'Goiânia', 'GO', 'Serrinha', 14525, '#008000', '#ffffff', 'bra.2', '3395'],
  ['portuguesa', 'Portuguesa', 'POR', 3, 30, 'São Paulo', 'SP', 'Canindé', 21004, '#c00000', '#008000', 'bra.copa_do_brazil', '4773'],
  ['nautico', 'Náutico', 'NAU', 3, 31, 'Recife', 'PE', 'Aflitos', 20000, '#c00000', '#ffffff', 'bra.2', '7633'],
  ['santa-cruz', 'Santa Cruz', 'STA', 3, 30, 'Recife', 'PE', 'Arruda', 60044, '#000000', '#c00000', 'bra.copa_do_brazil', '4929'],
  ['juventude', 'Juventude', 'JUV', 4, 32, 'Caxias do Sul', 'RS', 'Alfredo Jaconi', 19924, '#008000', '#ffffff', 'bra.2', '6270'],
  ['criciuma', 'Criciúma', 'CRI', 4, 31, 'Criciúma', 'SC', 'Heriberto Hülse', 19225, '#ffff55', '#000000', 'bra.2', '9971'],
  ['parana', 'Paraná', 'PAR', 4, 25, 'Curitiba', 'PR', 'Vila Capanema', 17000, '#c00000', '#0000aa', null, null],
  ['ponte-preta', 'Ponte Preta', 'PON', 4, 30, 'Campinas', 'SP', 'Moisés Lucarelli', 17728, '#000000', '#ffffff', 'bra.2', '3459'],
  ['america-mg', 'América-MG', 'AME', 4, 33, 'Belo Horizonte', 'MG', 'Independência', 23018, '#008000', '#000000', 'bra.2', '6154'],
  ['paysandu', 'Paysandu', 'PAY', 4, 29, 'Belém', 'PA', 'Curuzu', 16200, '#0080c0', '#ffffff', 'bra.copa_do_brazil', '15424'],
  ['remo', 'Remo', 'REM', 4, 30, 'Belém', 'PA', 'Baenão', 17518, '#0000aa', '#ffffff', 'bra.1', '4936'],
  ['vila-nova', 'Vila Nova', 'VNO', 4, 31, 'Goiânia', 'GO', 'OBA', 11690, '#c00000', '#ffffff', 'bra.2', '9973'],
]

const paranaPlayers = [
  ['Juliano', 'G', 27], ['Cabral', 'G', 24], ['Matheus Barônio', 'G', 26],
  ['Lucas Serafini', 'D', 25], ['Bruno Dip', 'D', 26], ['Arthur Yan', 'D', 21],
  ['Alex Júnior', 'D', 24], ['Salazar', 'D', 28], ['Eduardo', 'D', 23],
  ['Matheus Santana', 'D', 27], ['Elvis', 'M', 35], ['Thiaguinho', 'M', 24],
  ['Gabriel Pfeiffer', 'M', 23], ['Lucas Nunes', 'M', 22], ['Antônio Pedro', 'M', 20],
  ['Lucas Bueno', 'A', 24], ['Liliu', 'A', 36], ['Ruan Lima', 'A', 23],
  ['Vinicius Ribeiro', 'A', 27], ['Nagi', 'A', 21], ['Daniel Cruz', 'A', 24],
  ['Lucas Caniggia', 'A', 22],
].map(([name, position, age], index) => ({
  sourceId: `ge-parana-${index + 1}`,
  name,
  position,
  age,
  nationality: 'BRA',
  appearances: 0,
}))

function appearances(athlete) {
  const categories = athlete.statistics?.splits?.categories ?? []
  const general = categories.find((category) => category.name === 'general')
  return general?.stats?.find((stat) => stat.name === 'appearances')?.value ?? 0
}

function normalize(athlete) {
  const position = athlete.position?.abbreviation === 'F' ? 'A' : athlete.position?.abbreviation
  return {
    sourceId: `espn-${athlete.id}`,
    name: athlete.displayName,
    position: ['G', 'D', 'M', 'A'].includes(position) ? position : 'M',
    age: athlete.age ?? 23,
    nationality: athlete.citizenshipCountry?.abbreviation ?? 'BRA',
    appearances: appearances(athlete),
  }
}

function selectBalanced(players) {
  const quotas = { G: 2, D: 6, M: 6, A: 4 }
  // Keep the scripted auction player even when appearances put him below the cutoff.
  const priority = (player) => Number(player.sourceId === 'espn-132948')
  const sorted = [...players].sort((a, b) => priority(b) - priority(a) || b.appearances - a.appearances || a.name.localeCompare(b.name, 'pt-BR'))
  const selected = []
  for (const position of ['G', 'D', 'M', 'A']) {
    selected.push(...sorted.filter((player) => player.position === position).slice(0, quotas[position]))
  }
  const ids = new Set(selected.map((player) => player.sourceId))
  for (const player of sorted) {
    if (selected.length >= 18) break
    if (!ids.has(player.sourceId)) {
      selected.push(player)
      ids.add(player.sourceId)
    }
  }
  if (selected.length < 18 || !selected.some((player) => player.position === 'G')) {
    throw new Error(`Roster has insufficient positional coverage (${selected.length})`)
  }
  return selected.slice(0, 18).map(({ appearances: _appearances, ...player }) => player)
}

async function fetchClub(club) {
  const [id, name, shortName, division, rating, city, state, stadium, capacity, primary, secondary, league, espnId] = club
  let players
  let source
  if (id === 'parana') {
    players = selectBalanced(paranaPlayers)
    source = 'GE Copa Paraná roster, 2026-07-29'
  } else {
    const response = await fetch(`${ESPN_ROOT}/${league}/teams/${espnId}/roster`)
    if (!response.ok) throw new Error(`${name}: ESPN ${response.status}`)
    const payload = await response.json()
    players = selectBalanced((payload.athletes ?? []).map(normalize))
    source = `ESPN ${league} roster, ${FETCHED_AT}`
  }
  return { id, name, shortName, division, rating, city, state, stadium, capacity, primary, secondary, source, players }
}

const roster = []
for (const club of clubs) {
  const result = await fetchClub(club)
  roster.push(result)
  process.stdout.write(`${result.shortName}: ${result.players.length} players\n`)
}

const output = `// Generated by scripts/fetch-rosters.mjs. Do not edit by hand.\n` +
  `// Player identity snapshot: ${SNAPSHOT_ID}. Emifoot ratings are derived at game creation.\n` +
  `export const ROSTER_SNAPSHOT_ID = ${JSON.stringify(SNAPSHOT_ID)} as const\n` +
  `export const ROSTER_FETCHED_AT = ${JSON.stringify(FETCHED_AT)} as const\n` +
  `export const RAW_CLUBS = ${JSON.stringify(roster, null, 2)} as const\n`

await mkdir(new URL('../src/data/', import.meta.url), { recursive: true })
await writeFile(new URL('../src/data/rosters.generated.ts', import.meta.url), output)
process.stdout.write(`Wrote ${roster.length} clubs to src/data/rosters.generated.ts\n`)
