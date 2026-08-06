import { MEMBERS_DATA, SQUAD_AVERAGES_BY_SPORT } from "../data/mockData";

// Simulate asynchronous API latency
const delay = (ms = 200) => new Promise(resolve => setTimeout(resolve, ms));

export const apiService = {
  /**
   * Fetch all members summary list
   */
  async getMembers() {
    await delay(150);
    return MEMBERS_DATA.map(m => ({
      id: m.id,
      name: m.name,
      sex: m.sex,
      age: m.age,
      sport: m.sport,
      sessions: m.sessions,
      lastTested: m.lastTested
    }));
  },

  /**
   * Fetch Squad Comparison data filtered by Sport and Sex
   */
  async getSquadComparison(sportFilter = "All", sexFilter = "All") {
    await delay(200);

    let filtered = MEMBERS_DATA;

    if (sportFilter !== "All") {
      if (sportFilter === "S&C") {
        filtered = filtered.filter(m => m.sport === "Strength & Conditioning");
      } else {
        filtered = filtered.filter(m => m.sport === sportFilter);
      }
    }

    if (sexFilter !== "All") {
      filtered = filtered.filter(m => m.sex === sexFilter);
    }

    // Compute key dynamic metrics
    const totalMembers = filtered.length;
    const avgCMJ = totalMembers > 0 
      ? (filtered.reduce((acc, m) => acc + m.latestCMJ, 0) / totalMembers).toFixed(1)
      : "0.0";
    
    const avgGrip = totalMembers > 0 
      ? (filtered.reduce((acc, m) => acc + m.latestGrip, 0) / totalMembers).toFixed(1)
      : "0.0";

    const avgAsym = totalMembers > 0 
      ? (filtered.reduce((acc, m) => acc + m.latestAsym, 0) / totalMembers).toFixed(1)
      : "0.0";

    return {
      totalMembers,
      avgCMJ: parseFloat(avgCMJ),
      avgGrip: parseFloat(avgGrip),
      avgAsym: parseFloat(avgAsym),
      members: filtered.map(m => ({
        id: m.id,
        name: m.name,
        sex: m.sex,
        age: m.age,
        sport: m.sport,
        latestCMJ: m.latestCMJ,
        latestGrip: m.latestGrip,
        latestAsym: m.latestAsym
      })),
      groupAverages: SQUAD_AVERAGES_BY_SPORT
    };
  },

  /**
   * Fetch details for a specific member by ID
   */
  async getMemberDetail(memberId) {
    await delay(180);
    const member = MEMBERS_DATA.find(m => m.id === memberId) || MEMBERS_DATA[0];
    return member;
  }
};
