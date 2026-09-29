import { describe, expect, it } from 'vitest'
import { calculateAiAuctionSalary, calculatePlayerSalary, calculateRegularAuctionMinimum, normalizeSalaryOffer, updateSupportersAfterMatch } from './economy'
import { createNewCareer } from './setup'
import { calculateAttendance } from './match'
import { MATCHDAY_GATE_SHARE } from './constants'

describe('Elifoot-style salary scale', () => {
  it('keeps ordinary and elite wages in the original low-thousands range', () => {
    expect(calculatePlayerSalary(15, 25)).toBe(1_400)
    expect(calculatePlayerSalary(26, 25)).toBe(3_200)
    expect(calculatePlayerSalary(41, 25)).toBe(7_200)
  })

  it('prevents normal AI auctions from ballooning an elite wage', () => {
    const eliteSalary = calculatePlayerSalary(45, 25)
    const minimum = calculateRegularAuctionMinimum(eliteSalary)

    expect(eliteSalary).toBe(8_600)
    expect(minimum).toBe(5_600)
    expect(calculateAiAuctionSalary(minimum, 0)).toBe(5_900)
    expect(calculateAiAuctionSalary(minimum, 1)).toBe(9_000)
  })

  it('normalizes every typed auction offer to the same 50-unit scale used for comparison', () => {
    expect(normalizeSalaryOffer(5_124)).toBe(5_100)
    expect(normalizeSalaryOffer(5_126)).toBe(5_150)
    expect(normalizeSalaryOffer(70_000)).toBe(64_000)
  })

  it('moves supporters with results and rewards an upset more than an expected win', () => {
    const supporters = 10_000
    const expectedWin = updateSupportersAfterMatch(supporters, 45, 30, 'V', 1, 'league')
    const upsetWin = updateSupportersAfterMatch(supporters, 30, 45, 'V', 1, 'league')
    const draw = updateSupportersAfterMatch(supporters, 35, 35, 'E', 0, 'league')
    const loss = updateSupportersAfterMatch(supporters, 35, 35, 'D', -1, 'league')

    expect(expectedWin).toBeGreaterThan(supporters)
    expect(upsetWin).toBeGreaterThan(expectedWin)
    expect(draw).toBeGreaterThan(supporters)
    expect(loss).toBeLessThan(supporters)
  })

  it('rewards a winning streak and large wins more than an isolated narrow win', () => {
    const isolated = updateSupportersAfterMatch(10_000, 30, 30, 'V', 1, 'league', ['D', 'V'])
    const streak = updateSupportersAfterMatch(10_000, 30, 30, 'V', 1, 'league', ['V', 'V', 'V', 'V', 'V'])
    const goals = updateSupportersAfterMatch(10_000, 30, 30, 'V', 4, 'league', ['D', 'V'])
    expect(isolated).toBeGreaterThanOrEqual(10_100)
    expect(streak).toBeGreaterThan(isolated)
    expect(goals).toBeGreaterThan(isolated)
    expect(updateSupportersAfterMatch(10_000, 30, 30, 'V', 1, 'cup')).toBeGreaterThan(isolated)
  })

  it('turns a fourth-division winning run into materially more members, fuller stands and higher gate income', () => {
    const state = createNewCareer({ managerName: 'Sócios', seed: 82 })
    const club = state.clubs.find((candidate) => candidate.id === 'juventude')!
    club.ticketPrice = 10
    const opponent = state.clubs.find((candidate) => candidate.id === 'criciuma')!
    const initialSupporters = club.supporters
    const initialAttendance = calculateAttendance(club, opponent)
    for (let match = 0; match < 6; match++) {
      club.form = [...club.form, 'V' as const].slice(-5)
      club.supporters = updateSupportersAfterMatch(club.supporters, club.rating, opponent.rating, 'V', 3, 'league', club.form)
    }
    const attendance = calculateAttendance(club, opponent, 1)
    const gate = attendance * club.ticketPrice * MATCHDAY_GATE_SHARE
    const initialGate = initialAttendance * club.ticketPrice * MATCHDAY_GATE_SHARE
    expect(club.supporters).toBeGreaterThan(initialSupporters * 1.12)
    expect(attendance).toBeGreaterThan(club.stadium.capacity * 0.75)
    expect(attendance).toBeLessThanOrEqual(club.stadium.capacity)
    expect(gate).toBeGreaterThan(initialGate * 1.4)
    const wages = club.players.reduce((sum, player) => sum + player.salary, 0)
    expect(gate + club.sponsorPerRound * 2 - (wages + club.stadium.capacity * 0.12) * 2).toBeGreaterThan(0)
  })

  it('uses home form and league position for crowds while retaining price, condition and capacity limits', () => {
    const state = createNewCareer({ managerName: 'Público', seed: 83 })
    const club = state.clubs.find((candidate) => candidate.id === 'juventude')!
    club.ticketPrice = 10
    const away = state.clubs.find((candidate) => candidate.id === 'criciuma')!
    const neutral = calculateAttendance(club, away)
    away.form = ['V', 'V', 'V', 'V', 'V']
    expect(calculateAttendance(club, away)).toBe(neutral)
    club.form = ['V', 'V', 'V', 'V', 'V']
    const inForm = calculateAttendance(club, away)
    expect(inForm).toBeGreaterThan(neutral)
    const leader = calculateAttendance(club, away, 1)
    expect(leader).toBeGreaterThan(calculateAttendance(club, away, 2))
    expect(calculateAttendance(club, away, 2)).toBeGreaterThan(inForm)
    club.ticketPrice = 100
    expect(calculateAttendance(club, away, 1)).toBeLessThan(leader)
    club.ticketPrice = 10
    club.stadium.condition = 35
    expect(calculateAttendance(club, away, 1)).toBeLessThan(leader)
    club.form = ['D', 'D', 'D', 'D', 'D']
    expect(calculateAttendance(club, away)).toBeLessThan(neutral)
    club.supporters = 1_000_000
    expect(calculateAttendance(club, away)).toBe(club.stadium.capacity)
  })
})
