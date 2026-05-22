fetch('https://invoex.vercel.app/')
  .then(r => r.text())
  .then(t => {
    const match = t.match(/src="(\/assets\/index-.*?\.js)"/);
    if (!match) throw new Error("Could not find JS bundle");
    const jsUrl = 'https://invoex.vercel.app' + match[1];
    return fetch(jsUrl);
  })
  .then(r => r.text())
  .then(t => {
    if (t.includes('gen-lang-client-00224039-a9ae1')) {
      console.log("Vercel is using the NEW Blaze project");
    } else if (t.includes('studio-2901235520-386ed')) {
      console.log("Vercel is still using the OLD Spark project");
    } else {
      console.log("Could not find either project ID");
    }
  })
  .catch(e => console.error(e));
