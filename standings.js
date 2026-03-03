// standings.js
const url = "https://football-standings-api.vercel.app/leagues/tur.1/standings?season=2025&sort=asc";

fetch(url)
  .then(res => res.json())
  .then(data => {
    const standings = data.data.standings; // array of team objects
    const fb = standings.find(team => team.team.name === "Fenerbahce");

    if (fb) {
      const stats = fb.stats.reduce((acc, stat) => {
        acc[stat.name] = stat.value;
        return acc;
      }, {});

      document.getElementById("fb-ranking").innerHTML = `
        <img src="${fb.team.logos[0].href}" width="15" alt="${fb.team.name} logo">
        <strong>${fb.team.name}</strong> — Position: ${stats.rank}, Points: ${stats.points}, Wins: ${stats.wins}, Losses: ${stats.losses}
      `;
    } else {
      document.getElementById("fb-ranking").textContent = "Fenerbahce not found.";
    }
  })
  .catch(() => {
    document.getElementById("fb-ranking").textContent = "Unable to fetch standings.";
  });