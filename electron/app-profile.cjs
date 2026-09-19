const fs=require('node:fs');
const path=require('node:path');

// Reuse the original profile on upgrades: it contains recovery drafts, recent
// projects and export history as well as the active workspace.
function profileDirectory(appData){
 const legacy=path.join(appData,'Cutroom');
 return fs.existsSync(legacy)?legacy:path.join(appData,'Narezator');
}

module.exports={profileDirectory};
