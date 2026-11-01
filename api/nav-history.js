export default async function handler(req, res) {
  const { fundId, days } = req.query;
  
  const response = await fetch(
    `https://beta-restapi.sarmaaya.pk/api/mutual-funds/nav-history/${fundId}?days=${days}`
  );
  
  const data = await response.json();
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(data);
}