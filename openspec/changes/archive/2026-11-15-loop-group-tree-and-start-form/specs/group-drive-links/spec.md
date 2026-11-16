## ADDED Requirements

### Requirement: Loop holds Drive links, never Drive access
A Google Drive file or folder SHALL be kept by a group as a link, like any other link: its address and a title. Loop SHALL NOT hold Google credentials of its own or of any person, SHALL NOT call Google Drive, and SHALL NOT store or list the content of anything in Drive. Who can open a linked file or folder SHALL be decided by Google Drive's own sharing, not by Loop.

#### Scenario: A Drive folder pasted into the start form
- **WHEN** a person pastes a Google Drive folder address into the start form
- **THEN** the address appears under Links and is saved as a link when the group is made

#### Scenario: Opening a Drive link on the site
- **WHEN** a member opens a Drive link from a group's page
- **THEN** it opens in Google Drive under the member's own Google account, and Drive decides whether they can see it

#### Scenario: No setup for the founder
- **WHEN** Loop is deployed with no Google configuration at all
- **THEN** Drive links are kept and shown exactly as they would be otherwise

### Requirement: A member's assistant opens Drive links with the member's own connection
Loop's connector SHALL tell an assistant that an output is a link, that Loop holds no file, and that the assistant is to open the link with the user's own connection to where the file lives (the Google Drive connection in the user's assistant, for example). The connector SHALL tell the assistant to say so when the user has no access to a link, rather than guess what the file holds. Loop SHALL NOT pass any person's Drive access to another person or to another person's assistant.

#### Scenario: Reading a group's reading list
- **WHEN** a member's assistant reads a group's record and finds a Drive link, and the member's assistant has a Google Drive connection
- **THEN** the assistant opens the link through that connection, with that member's Drive permissions

#### Scenario: A member without access to the file
- **WHEN** the link points to a file that is not shared with the member
- **THEN** their assistant cannot open it and tells the member so

#### Scenario: A member whose assistant has no Drive connection
- **WHEN** the member's assistant has no connection to Google Drive, or the member uses the site only
- **THEN** the member still sees the link and can open it by hand

### Requirement: A document an assistant makes is saved to Drive by the assistant, and filed as a link
Loop's connector SHALL tell an assistant that, when it has made a document for the group, it first saves the document where the team keeps its files (the user's Google Drive, for example) through the user's own connection, and then files the link in Loop as an output. Loop SHALL keep the link, the title and the summary, and never the file.

#### Scenario: Claude drafts a memo for the team
- **WHEN** a member asks their assistant to draft a memo for the team and share it
- **THEN** the assistant creates the document in the member's Drive through the member's connection, and files its link in the group's record

#### Scenario: Sharing is the member's to set
- **WHEN** the document the assistant saved is not shared with the rest of the group in Drive
- **THEN** other members see the link in Loop but cannot open the file until its owner shares it in Drive
