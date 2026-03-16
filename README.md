### Rapidleech on Ubuntu

Build and Edited from https://github.com/Th3-822/rapidleech

* Use Ubuntu 22.04 as 22.10 is not fully supported because of PHP 7.4 unavailablity.

````
bash <(curl -s https://cdn.jsdelivr.net/gh/PBhadoo/Rapidleech@1.6/rapidleech.sh)
````

Deployed at [https://gcp.apranet.eu.org](https://rapidleech-frankfurt.indexer.eu.org/)

Visit https://telegam.dog/Transload

### Deploy to Vercel (Testing)

> **Note:** Vercel deployment is for **testing purposes only**. Production deployments should use servers like EC2. Vercel's serverless functions have a max execution timeout (10s on Hobby, 60s on Pro), a read-only filesystem (no file downloads/storage), and no persistent state — so file download/upload features won't work. This is useful for quickly testing the UI and plugin logic.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftemp-deployers%2FRapidleech)

Or deploy manually:

```bash
npm i -g vercel
vercel
```

### Make pull requests for changes or fixes.
