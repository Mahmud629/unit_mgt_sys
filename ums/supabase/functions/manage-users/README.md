# manage-users Edge Function

`supabase-js.bundle.mjs` is `@supabase/supabase-js` 2.118.0 packed into one file, so this
function does not download anything when it starts. That is what lets it run on a LAN
server with no internet connection.

To refresh the bundle later (on a PC with internet, in the project folder):

```
echo 'export { createClient } from "@supabase/supabase-js";' > entry.mjs
npx esbuild entry.mjs --bundle --format=esm --platform=browser --target=es2022 --minify --outfile=supabase/functions/manage-users/supabase-js.bundle.mjs
```
