# Firebase setup

This prototype can keep using `localStorage` until Firebase is configured.
After Firebase is configured, progress is saved to:

```text
users/{uid}/practiceProgress/examStructurePractice
```

## Firebase console

1. Create or open a Firebase project.
2. Enable Firestore Database.
3. Enable Authentication.
4. In Authentication sign-in methods, enable Google.
5. Create a Web app and copy its Firebase config.
6. Paste the config into `exam-structure-practice-demo.html` in the `firebaseConfig` object.
7. Publish the rules in `firestore.rules`.

## Data shape

The progress document stores the same shape that the old local progress used:

```json
{
  "lastQuestionId": "exam-115-01",
  "questions": {
    "exam-115-01": {
      "stage": 4,
      "highlightDone": true,
      "selectedMarker": "subject",
      "highlightMarks": {},
      "placements": {},
      "selectedTense": "present-simple",
      "selectedVoice": "active",
      "builtPieces": ["p1", "p2", "p3"],
      "revealed": false,
      "completed": true,
      "updatedAt": 1781100000000
    }
  },
  "updatedAt": "server timestamp"
}
```

## Notes

- The Firebase Web API key in `firebaseConfig` is not a password, but the project must still be protected with Firestore rules.
- Google Auth is used for cloud progress. Users must sign in before progress can sync across devices.
- Questions stay embedded in the HTML because each item includes the interaction structure and teaching analysis.
- Firestore stores student progress only, keyed by the embedded `question.id`.
