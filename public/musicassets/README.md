Put your preset folders in this directory.

Each preset folder should include:
- cover-front.jpeg
- cover-back.jpeg
- button-map.jpeg (1024x1024 recommended, split into 16 equal regions)
- loop01.mp3 ... loop16.mp3 (all loops must share the same BPM and loop length)

Then add an entry in `albums.json`:

{
  "id": "myalbum",
  "title": "My Album",
  "folder": "myalbum",
  "coverFront": "cover-front.jpeg",
  "coverBack": "cover-back.jpeg",
  "buttonMap": "button-map.jpeg",
  "loops": [
    "loop01.mp3",
    "loop02.mp3",
    "loop03.mp3",
    "loop04.mp3",
    "loop05.mp3",
    "loop06.mp3",
    "loop07.mp3",
    "loop08.mp3",
    "loop09.mp3",
    "loop10.mp3",
    "loop11.mp3",
    "loop12.mp3",
    "loop13.mp3",
    "loop14.mp3",
    "loop15.mp3",
    "loop16.mp3"
  ]
}
