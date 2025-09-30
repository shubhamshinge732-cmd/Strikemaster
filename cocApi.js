
// Simple encryption/decryption for API keys (basic obfuscation)
function encryptApiKey(apiKey) {
  return Buffer.from(apiKey).toString('base64');
}

function decryptApiKey(encryptedKey) {
  try {
    return Buffer.from(encryptedKey, 'base64').toString('utf-8');
  } catch (error) {
    return null;
  }
}

async function validateCocApiKey(apiKey) {
  try {
    const response = await fetch('https://api.clashofclans.com/v1/clans/%232PP', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (response.status === 200) {
      return { valid: true, message: 'API key is valid and working!' };
    } else if (response.status === 403) {
      return { valid: false, message: 'API key is invalid, expired, or IP not whitelisted.' };
    } else {
      return { valid: false, message: `API returned status ${response.status}` };
    }
  } catch (error) {
    return { valid: false, message: `Connection error: ${error.message}` };
  }
}

async function getCocClanInfo(clanTag, apiKey) {
  try {
    let cleanTag = clanTag.replace(/[#\s]/g, '').toUpperCase();
    
    const response = await fetch(`https://api.clashofclans.com/v1/clans/%23${encodeURIComponent(cleanTag)}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (response.status === 200) {
      const data = await response.json();
      return { success: true, data: data };
    } else if (response.status === 404) {
      return { success: false, message: `Clan not found with tag: #${cleanTag}` };
    } else {
      return { success: false, message: `API error: ${response.status}` };
    }
  } catch (error) {
    return { success: false, message: `Connection error: ${error.message}` };
  }
}

async function getCocCurrentWar(clanTag, apiKey) {
  try {
    let cleanTag = clanTag.replace(/[#\s]/g, '').toUpperCase();
    
    const response = await fetch(`https://api.clashofclans.com/v1/clans/%23${encodeURIComponent(cleanTag)}/currentwar`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (response.status === 200) {
      const data = await response.json();
      return { success: true, data: data };
    } else if (response.status === 404) {
      return { success: false, message: 'No active war found or war log is private' };
    } else if (response.status === 403) {
      return { success: false, message: 'Access forbidden - check API key permissions' };
    } else {
      return { success: false, message: `API error: ${response.status}` };
    }
  } catch (error) {
    return { success: false, message: `Connection error: ${error.message}` };
  }
}

async function getCocPlayer(playerTag, apiKey) {
  try {
    let cleanTag = playerTag.replace(/[#\s]/g, '').toUpperCase();
    
    const response = await fetch(`https://api.clashofclans.com/v1/players/%23${encodeURIComponent(cleanTag)}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (response.status === 200) {
      const data = await response.json();
      return { success: true, data: data };
    } else if (response.status === 404) {
      return { success: false, message: `Player not found with tag: #${cleanTag}` };
    } else {
      return { success: false, message: `API error: ${response.status}` };
    }
  } catch (error) {
    return { success: false, message: `Connection error: ${error.message}` };
  }
}

async function getCocWarLog(clanTag, apiKey, limit = 10) {
  try {
    let cleanTag = clanTag.replace(/[#\s]/g, '').toUpperCase();
    
    const response = await fetch(`https://api.clashofclans.com/v1/clans/%23${encodeURIComponent(cleanTag)}/warlog?limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (response.status === 200) {
      const data = await response.json();
      return { success: true, data: data };
    } else if (response.status === 404) {
      return { success: false, message: 'War log not found or is private' };
    } else {
      return { success: false, message: `API error: ${response.status}` };
    }
  } catch (error) {
    return { success: false, message: `Connection error: ${error.message}` };
  }
}

module.exports = {
  encryptApiKey,
  decryptApiKey,
  validateCocApiKey,
  getCocClanInfo,
  getCocCurrentWar,
  getCocPlayer,
  getCocWarLog
};
