Before committing

Before creating any Git commit, always run:
npm run format:prettier

If Prettier modifies any files, include those changes in the commit.
Do not create the commit if the Prettier command fails. Fix the formatting issue first, rerun Prettier successfully, then commit.
This step is mandatory for every commit.