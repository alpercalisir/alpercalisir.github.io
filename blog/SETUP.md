# Blog setup

GitHub Pages serves the site as static files. Supabase provides author login and persistent post storage. The browser uses only the project URL and anon/publishable key. Never place the Supabase `service_role` key in this site.

1. Create a Supabase project.
2. Run all of `setup.sql` in the Supabase SQL Editor.
3. Create the author account in Authentication → Users.
4. Add that account to the author allowlist in the SQL Editor, replacing the UUID:

   ```sql
   insert into public.blog_authors (user_id) values ('AUTHOR-USER-UUID');
   ```

   Find the UUID in Authentication → Users.
5. Put the project URL and anon/publishable key in `config.js`.
6. Push the changes to GitHub Pages. The editor will be available at `/blog/write.html`; the public blog is `/blog/`.

The row-level security policies let visitors read published posts. Only users added to `blog_authors` can read or edit drafts and publish posts. The editor has no public sign-up form. Drafts are also kept in the browser so text remains available if the database is not configured or temporarily unreachable.
