console.log('USERNAME:', process.env.USERNAME);
console.log('LOCALAPPDATA:', process.env.LOCALAPPDATA);
console.log('APPDATA:', process.env.APPDATA);
console.log('USERPROFILE:', process.env.USERPROFILE);
console.log('HOME:', process.env.HOME || 'not set');
console.log('os.homedir():', require('os').homedir());
