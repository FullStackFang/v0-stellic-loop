## ADDED Requirements

### Requirement: Made pictures are served from file storage
Every kept made animal and every group picture SHALL be stored as a file in Vercel Blob when it is kept, and a page that shows it SHALL point at that file. Showing a made picture SHALL NOT need a call to the app or a database read.

#### Scenario: The picker
- **WHEN** a person with twelve made animals opens the animal picker
- **THEN** every made animal's image address is a Blob address, and no request goes to `/animals/custom/`

#### Scenario: After a deploy
- **WHEN** a new version is deployed and a person opens Conga
- **THEN** their made animals load from the same Blob addresses as before the deploy

### Requirement: Old picture addresses keep working
`/animals/custom/<token>`, `/animals/group/<token>` and `/animals/group/<token>/full` SHALL keep answering:
- with a permanent redirect to the picture's Blob file when it has one;
- with the picture from the database when it has none.

#### Scenario: A link shared before the change
- **WHEN** someone opens `/animals/custom/<token>` for a kept animal stored in Blob
- **THEN** they are redirected to its Blob file and see the animal

#### Scenario: Blob not set up
- **WHEN** the app runs with no Blob token
- **THEN** pictures are served from the database as before

### Requirement: Deleting a picture deletes its file
When a made picture or group picture is deleted (a draft thrown away, a redraw swapped, the admin's Delete for good, or a person's data deleted), its Blob files SHALL be deleted too.

#### Scenario: A person's data is deleted
- **WHEN** a person's data is deleted
- **THEN** the Blob files of every animal they made no longer answer

### Requirement: Pictures made before the change are moved
The made animals and group pictures that exist before the change SHALL be copied to Blob once, keeping their tokens, so every page shows them from Blob.

#### Scenario: The copy
- **WHEN** the copy has run
- **THEN** every kept made animal and group picture has a Blob address, and showing it matches the picture the database held
