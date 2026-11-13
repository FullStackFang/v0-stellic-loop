## ADDED Requirements

### Requirement: A group can connect one Drive folder
An owner or organizer of a group SHALL be able to connect one Google Drive folder to the group from the site, by sharing that folder with the address Loop shows and giving Loop the folder's link. Loop SHALL confirm it can list the folder, and that the person connecting is the one who shared it with Loop or its owner, before saving the connection. A group SHALL have at most one connected folder; connecting another SHALL replace it. Connecting SHALL NOT be possible through an assistant.

#### Scenario: Connect a shared folder
- **WHEN** an organizer shares a folder with Loop's address as Viewer and submits the folder's link
- **THEN** the group shows that folder as connected, by its name

#### Scenario: Folder not shared with Loop
- **WHEN** an organizer submits the link of a folder that has not been shared with Loop's address
- **THEN** nothing is saved and the organizer is told to share the folder with that address first

#### Scenario: A folder someone else shared
- **WHEN** an organizer submits the link of a folder that another person shared with Loop's address
- **THEN** nothing is saved and the organizer is told to connect a folder they shared themselves, from the Google account with their Loop email

#### Scenario: Not a folder link
- **WHEN** the link is not a Google Drive folder address
- **THEN** nothing is saved as a Drive folder

#### Scenario: Member cannot connect
- **WHEN** a member who is not an owner or organizer tries to connect a folder
- **THEN** the request is refused

### Requirement: Loop reads that folder only, and only reads
Loop SHALL request from Google only read access to file details (names, types, dates), never file content. Loop SHALL list only files directly inside the connected folder. Loop SHALL NOT store the content of any Drive file, SHALL NOT store any person's Google credentials, and SHALL NOT change, move, share or delete anything in Drive.

#### Scenario: Files listed as links
- **WHEN** a member opens the group's Resources page and the folder holds three files
- **THEN** the page lists the three files by name, with type and last change, each a link that opens in Google Drive

#### Scenario: Nothing outside the folder
- **WHEN** the folder's owner has other folders that were never shared with Loop
- **THEN** no page or tool result names any file from them

#### Scenario: Access taken away in Drive
- **WHEN** the folder is no longer shared with Loop's address
- **THEN** the Resources page says Loop can no longer read the folder and lists no files from it

### Requirement: Who sees the folder
Everyone in the group SHALL see, on the site, the list of files in its connected folder. The list SHALL NOT be given to an assistant in this change. A person who is not in the group SHALL NOT see the folder's name, its files or that a folder is connected. Before connecting, the form SHALL tell the organizer that everyone in the group will see the names of the files in the folder.

#### Scenario: Inner-only member and the outer group's folder
- **WHEN** a person in "Team 1" only opens "Team 1", and "EMBA 2027" has a connected folder
- **THEN** nothing about that folder is shown

#### Scenario: Outside the group
- **WHEN** a signed-in person who is not in the group requests the group's resources
- **THEN** the request is refused in the same way as for a group that does not exist

### Requirement: Disconnecting
An owner or organizer SHALL be able to disconnect the folder from the site. After that the group SHALL list no files from it. Nothing in Drive SHALL change.

#### Scenario: Disconnect
- **WHEN** an organizer disconnects the folder
- **THEN** the Resources page no longer lists Drive files and offers to connect a folder

### Requirement: Drive is optional
When Loop has no Google service account configured, the site SHALL NOT show the Drive lane, Loop's sharing address or the Drive section of Resources, and a Drive folder address pasted into the start form SHALL be kept as an ordinary link.

#### Scenario: Not configured
- **WHEN** the service account is not configured and a person pastes a Drive folder address into the start form
- **THEN** the address appears under Links
