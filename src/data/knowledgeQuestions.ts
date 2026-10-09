/**
 * General-knowledge quiz bank — middle / high school level.
 * Each question has one correct answer and three distractors.
 */

export type KnowledgeCategory =
  | "celebrities"
  | "history"
  | "science"
  | "math"
  | "geography";

export type KnowledgeQuestion = {
  category: KnowledgeCategory;
  /** Prompt shown after the category reveal. */
  question: string;
  correct: string;
  wrong: readonly [string, string, string];
};

export const KNOWLEDGE_CATEGORIES = [
  "celebrities",
  "history",
  "science",
  "math",
  "geography",
] as const satisfies readonly KnowledgeCategory[];

export const KNOWLEDGE_CATEGORY_META: Record<
  KnowledgeCategory,
  { label: string; thumbFile: string }
> = {
  celebrities: { label: "Celebrities", thumbFile: "celebrities.png" },
  history: { label: "History", thumbFile: "history.png" },
  science: { label: "Science", thumbFile: "science.png" },
  math: { label: "Math", thumbFile: "math.png" },
  geography: { label: "Geography", thumbFile: "geography.png" },
};

export const KNOWLEDGE_QUESTIONS: readonly KnowledgeQuestion[] = [
  // ── Celebrities (30) ──────────────────────────────────────────────
  {
    category: "celebrities",
    question: "Taylor Swift is best known as a ____.",
    correct: "Singer-songwriter",
    wrong: ["Olympic swimmer", "Astronaut", "Chef"],
  },
  {
    category: "celebrities",
    question: "Which artist released the album *Thriller*?",
    correct: "Michael Jackson",
    wrong: ["Prince", "Elvis Presley", "Justin Bieber"],
  },
  {
    category: "celebrities",
    question: "Who played Spider-Man in the MCU starting in 2016?",
    correct: "Tom Holland",
    wrong: ["Tobey Maguire", "Andrew Garfield", "Chris Evans"],
  },
  {
    category: "celebrities",
    question: "Beyoncé was originally a member of which group?",
    correct: "Destiny's Child",
    wrong: ["Spice Girls", "Blackpink", "Fifth Harmony"],
  },
  {
    category: "celebrities",
    question: "LeBron James plays which sport?",
    correct: "Basketball",
    wrong: ["Football", "Baseball", "Soccer"],
  },
  {
    category: "celebrities",
    question: "Who created the character Mickey Mouse?",
    correct: "Walt Disney",
    wrong: ["Jim Henson", "Stan Lee", "Hayao Miyazaki"],
  },
  {
    category: "celebrities",
    question: "Rihanna is from which Caribbean country?",
    correct: "Barbados",
    wrong: ["Jamaica", "Haiti", "Cuba"],
  },
  {
    category: "celebrities",
    question: "Which actor played Iron Man in the Marvel films?",
    correct: "Robert Downey Jr.",
    wrong: ["Chris Hemsworth", "Mark Ruffalo", "Jeremy Renner"],
  },
  {
    category: "celebrities",
    question: "Oprah Winfrey is famous for hosting a ____.",
    correct: "Talk show",
    wrong: ["Cooking contest", "Sports podcast", "Weather report"],
  },
  {
    category: "celebrities",
    question: "Who is known as “The King of Pop”?",
    correct: "Michael Jackson",
    wrong: ["Elvis Presley", "Bruno Mars", "Usher"],
  },
  {
    category: "celebrities",
    question: "Selena Gomez started acting on which Disney show?",
    correct: "Wizards of Waverly Place",
    wrong: ["Hannah Montana", "iCarly", "Victorious"],
  },
  {
    category: "celebrities",
    question: "Cristiano Ronaldo is a professional ____.",
    correct: "Soccer player",
    wrong: ["Tennis player", "Golfer", "Boxer"],
  },
  {
    category: "celebrities",
    question: "Who directed the movie *Titanic*?",
    correct: "James Cameron",
    wrong: ["Steven Spielberg", "Christopher Nolan", "Martin Scorsese"],
  },
  {
    category: "celebrities",
    question: "Ariana Grande first rose to fame on which Nickelodeon show?",
    correct: "Victorious",
    wrong: ["iCarly", "Sam & Cat", "Zoey 101"],
  },
  {
    category: "celebrities",
    question: "Which singer is nicknamed “Queen B”?",
    correct: "Beyoncé",
    wrong: ["Billie Eilish", "Britney Spears", "Lady Gaga"],
  },
  {
    category: "celebrities",
    question: "Dwayne Johnson is also known as ____.",
    correct: "The Rock",
    wrong: ["The Rockstar", "Stone Cold", "The Hammer"],
  },
  {
    category: "celebrities",
    question: "Who painted the *Mona Lisa*?",
    correct: "Leonardo da Vinci",
    wrong: ["Michelangelo", "Picasso", "Van Gogh"],
  },
  {
    category: "celebrities",
    question: "Billie Eilish’s brother Finneas is also her ____.",
    correct: "Music producer",
    wrong: ["Football coach", "Movie director", "Chef"],
  },
  {
    category: "celebrities",
    question: "Which celebrity founded the brand Fenty Beauty?",
    correct: "Rihanna",
    wrong: ["Kylie Jenner", "Kim Kardashian", "Zendaya"],
  },
  {
    category: "celebrities",
    question: "Usain Bolt set world records in which sport?",
    correct: "Sprinting",
    wrong: ["Swimming", "High jump", "Boxing"],
  },
  {
    category: "celebrities",
    question: "Who plays Elsa in Disney’s *Frozen*?",
    correct: "Idina Menzel (voice)",
    wrong: ["Taylor Swift", "Ariana Grande", "Adele"],
  },
  {
    category: "celebrities",
    question: "Dr. Seuss wrote which of these books?",
    correct: "The Cat in the Hat",
    wrong: ["Charlotte's Web", "Harry Potter", "The Hobbit"],
  },
  {
    category: "celebrities",
    question: "Which K-pop group released “Dynamite”?",
    correct: "BTS",
    wrong: ["BLACKPINK", "EXO", "TWICE"],
  },
  {
    category: "celebrities",
    question: "Simone Biles is an Olympic champion in ____.",
    correct: "Gymnastics",
    wrong: ["Figure skating", "Diving", "Track"],
  },
  {
    category: "celebrities",
    question: "Who is the author of the *Harry Potter* books?",
    correct: "J.K. Rowling",
    wrong: ["Stephen King", "Roald Dahl", "Suzanne Collins"],
  },
  {
    category: "celebrities",
    question: "Elon Musk is the CEO of which car company?",
    correct: "Tesla",
    wrong: ["Ford", "Toyota", "BMW"],
  },
  {
    category: "celebrities",
    question: "Which artist is known for songs like “Bad Guy”?",
    correct: "Billie Eilish",
    wrong: ["Olivia Rodrigo", "Dua Lipa", "Doja Cat"],
  },
  {
    category: "celebrities",
    question: "Tom Brady is famous for playing ____.",
    correct: "American football",
    wrong: ["Basketball", "Hockey", "Baseball"],
  },
  {
    category: "celebrities",
    question: "Zendaya starred as Rue in which HBO series?",
    correct: "Euphoria",
    wrong: ["Stranger Things", "The Crown", "Wednesday"],
  },
  {
    category: "celebrities",
    question: "Which comedian hosted *The Daily Show* for many years?",
    correct: "Jon Stewart",
    wrong: ["Jimmy Fallon", "Stephen Colbert", "John Oliver"],
  },

  // ── History (30) ──────────────────────────────────────────────────
  {
    category: "history",
    question: "In what year did the United States declare independence?",
    correct: "1776",
    wrong: ["1492", "1812", "1865"],
  },
  {
    category: "history",
    question: "Who was the first President of the United States?",
    correct: "George Washington",
    wrong: ["Thomas Jefferson", "Abraham Lincoln", "John Adams"],
  },
  {
    category: "history",
    question: "The ancient Egyptians built the ____.",
    correct: "Pyramids",
    wrong: ["Colosseum", "Great Wall", "Eiffel Tower"],
  },
  {
    category: "history",
    question: "World War II ended in which year?",
    correct: "1945",
    wrong: ["1918", "1939", "1963"],
  },
  {
    category: "history",
    question: "Who was known as the “Maid of Orléans”?",
    correct: "Joan of Arc",
    wrong: ["Cleopatra", "Queen Victoria", "Marie Antoinette"],
  },
  {
    category: "history",
    question: "The Roman Empire’s capital was ____.",
    correct: "Rome",
    wrong: ["Athens", "Cairo", "Paris"],
  },
  {
    category: "history",
    question: "Abraham Lincoln issued the Emancipation ____.",
    correct: "Proclamation",
    wrong: ["Declaration", "Constitution", "Amendment"],
  },
  {
    category: "history",
    question: "Which ship famously sank in 1912?",
    correct: "Titanic",
    wrong: ["Mayflower", "Santa Maria", "Lusitania"],
  },
  {
    category: "history",
    question: "The Great Wall was built to protect ____.",
    correct: "China",
    wrong: ["Japan", "India", "Russia"],
  },
  {
    category: "history",
    question: "Who discovered that Earth orbits the Sun (heliocentrism)?",
    correct: "Nicolaus Copernicus",
    wrong: ["Galileo Galilei", "Isaac Newton", "Aristotle"],
  },
  {
    category: "history",
    question: "The Civil Rights Act of 1964 was signed in the ____.",
    correct: "United States",
    wrong: ["United Kingdom", "Canada", "France"],
  },
  {
    category: "history",
    question: "Which civilization invented a form of writing called hieroglyphics?",
    correct: "Ancient Egypt",
    wrong: ["Ancient Greece", "Vikings", "Aztecs"],
  },
  {
    category: "history",
    question: "Martin Luther King Jr. gave the “I Have a Dream” speech in ____.",
    correct: "1963",
    wrong: ["1954", "1975", "1941"],
  },
  {
    category: "history",
    question: "The Berlin Wall fell in ____.",
    correct: "1989",
    wrong: ["1945", "1961", "2001"],
  },
  {
    category: "history",
    question: "Who was the British prime minister during most of WWII?",
    correct: "Winston Churchill",
    wrong: ["Neville Chamberlain", "Margaret Thatcher", "Tony Blair"],
  },
  {
    category: "history",
    question: "The Renaissance began in which country?",
    correct: "Italy",
    wrong: ["England", "Spain", "Germany"],
  },
  {
    category: "history",
    question: "Which war was fought between the North and South in the U.S.?",
    correct: "Civil War",
    wrong: ["Revolutionary War", "World War I", "War of 1812"],
  },
  {
    category: "history",
    question: "Neil Armstrong was the first person to walk on the ____.",
    correct: "Moon",
    wrong: ["Mars", "Sun", "International Space Station"],
  },
  {
    category: "history",
    question: "The Magna Carta was signed in ____.",
    correct: "1215",
    wrong: ["1492", "1776", "1066"],
  },
  {
    category: "history",
    question: "Who led the Mongol Empire at its height?",
    correct: "Genghis Khan",
    wrong: ["Alexander the Great", "Julius Caesar", "Attila"],
  },
  {
    category: "history",
    question: "The Industrial Revolution began in ____.",
    correct: "Britain",
    wrong: ["China", "Brazil", "Egypt"],
  },
  {
    category: "history",
    question: "Pearl Harbor was attacked in ____.",
    correct: "1941",
    wrong: ["1914", "1939", "1950"],
  },
  {
    category: "history",
    question: "Cleopatra was a ruler of ancient ____.",
    correct: "Egypt",
    wrong: ["Greece", "Rome", "Persia"],
  },
  {
    category: "history",
    question: "The Declaration of Independence was mainly written by ____.",
    correct: "Thomas Jefferson",
    wrong: ["Benjamin Franklin", "John Hancock", "James Madison"],
  },
  {
    category: "history",
    question: "Which empire built Machu Picchu?",
    correct: "Inca",
    wrong: ["Aztec", "Maya", "Olmec"],
  },
  {
    category: "history",
    question: "Suffrage means the right to ____.",
    correct: "Vote",
    wrong: ["Own land", "Travel", "Speak freely"],
  },
  {
    category: "history",
    question: "The Cold War was mainly between the U.S. and ____.",
    correct: "The Soviet Union",
    wrong: ["Germany", "Japan", "Canada"],
  },
  {
    category: "history",
    question: "Who invented the printing press in Europe?",
    correct: "Johannes Gutenberg",
    wrong: ["Leonardo da Vinci", "Isaac Newton", "Benjamin Franklin"],
  },
  {
    category: "history",
    question: "The French Revolution began in ____.",
    correct: "1789",
    wrong: ["1492", "1815", "1914"],
  },
  {
    category: "history",
    question: "Harriet Tubman helped people escape slavery via the ____.",
    correct: "Underground Railroad",
    wrong: ["Oregon Trail", "Silk Road", "Appian Way"],
  },

  // ── Science (30) ──────────────────────────────────────────────────
  {
    category: "science",
    question: "Water freezes at ____ degrees Celsius.",
    correct: "0",
    wrong: ["32", "100", "-10"],
  },
  {
    category: "science",
    question: "What planet is known as the Red Planet?",
    correct: "Mars",
    wrong: ["Venus", "Jupiter", "Mercury"],
  },
  {
    category: "science",
    question: "Humans need ____ to breathe.",
    correct: "Oxygen",
    wrong: ["Nitrogen", "Carbon dioxide", "Helium"],
  },
  {
    category: "science",
    question: "What is H₂O commonly known as?",
    correct: "Water",
    wrong: ["Salt", "Hydrogen gas", "Acid"],
  },
  {
    category: "science",
    question: "The center of an atom is called the ____.",
    correct: "Nucleus",
    wrong: ["Electron", "Orbit", "Molecule"],
  },
  {
    category: "science",
    question: "Photosynthesis mainly happens in a plant’s ____.",
    correct: "Leaves",
    wrong: ["Roots", "Flowers", "Seeds"],
  },
  {
    category: "science",
    question: "How many planets are in our solar system?",
    correct: "8",
    wrong: ["7", "9", "10"],
  },
  {
    category: "science",
    question: "What force pulls objects toward Earth?",
    correct: "Gravity",
    wrong: ["Magnetism", "Friction", "Inertia"],
  },
  {
    category: "science",
    question: "The hardest natural substance on Earth is ____.",
    correct: "Diamond",
    wrong: ["Gold", "Iron", "Quartz"],
  },
  {
    category: "science",
    question: "What gas do plants absorb from the air?",
    correct: "Carbon dioxide",
    wrong: ["Oxygen", "Nitrogen", "Helium"],
  },
  {
    category: "science",
    question: "Lightning is a form of ____.",
    correct: "Electricity",
    wrong: ["Magnetism", "Sound", "Pressure"],
  },
  {
    category: "science",
    question: "The boiling point of water at sea level is ____ °C.",
    correct: "100",
    wrong: ["0", "50", "212"],
  },
  {
    category: "science",
    question: "Which organ pumps blood through the body?",
    correct: "Heart",
    wrong: ["Lungs", "Liver", "Brain"],
  },
  {
    category: "science",
    question: "Sound travels fastest through ____.",
    correct: "Solids",
    wrong: ["Air", "Vacuum", "Outer space"],
  },
  {
    category: "science",
    question: "DNA carries ____ information.",
    correct: "Genetic",
    wrong: ["Weather", "Magnetic", "Musical"],
  },
  {
    category: "science",
    question: "Which planet is closest to the Sun?",
    correct: "Mercury",
    wrong: ["Venus", "Earth", "Mars"],
  },
  {
    category: "science",
    question: "A caterpillar turns into a butterfly during ____.",
    correct: "Metamorphosis",
    wrong: ["Hibernation", "Migration", "Photosynthesis"],
  },
  {
    category: "science",
    question: "What do you call animals that eat only plants?",
    correct: "Herbivores",
    wrong: ["Carnivores", "Omnivores", "Insectivores"],
  },
  {
    category: "science",
    question: "The chemical symbol for gold is ____.",
    correct: "Au",
    wrong: ["Ag", "Go", "Gd"],
  },
  {
    category: "science",
    question: "Earth’s atmosphere is mostly made of ____.",
    correct: "Nitrogen",
    wrong: ["Oxygen", "Carbon dioxide", "Hydrogen"],
  },
  {
    category: "science",
    question: "Which vitamin do you get from sunlight?",
    correct: "Vitamin D",
    wrong: ["Vitamin C", "Vitamin A", "Vitamin B12"],
  },
  {
    category: "science",
    question: "A mirror reflects ____.",
    correct: "Light",
    wrong: ["Sound", "Heat only", "Gravity"],
  },
  {
    category: "science",
    question: "Which blood cells help fight infection?",
    correct: "White blood cells",
    wrong: ["Red blood cells", "Platelets", "Plasma only"],
  },
  {
    category: "science",
    question: "The speed of light is fastest in a ____.",
    correct: "Vacuum",
    wrong: ["Water", "Glass", "Air"],
  },
  {
    category: "science",
    question: "What type of rock is formed from cooled lava?",
    correct: "Igneous",
    wrong: ["Sedimentary", "Metamorphic", "Fossil"],
  },
  {
    category: "science",
    question: "Bees help plants by ____.",
    correct: "Pollinating",
    wrong: ["Photosynthesis", "Hibernating", "Erosion"],
  },
  {
    category: "science",
    question: "Which planet has the most moons?",
    correct: "Saturn",
    wrong: ["Earth", "Mars", "Mercury"],
  },
  {
    category: "science",
    question: "The pH of pure water is about ____.",
    correct: "7",
    wrong: ["0", "3", "14"],
  },
  {
    category: "science",
    question: "Bones are mainly made of a mineral called ____.",
    correct: "Calcium",
    wrong: ["Iron", "Sodium", "Potassium"],
  },
  {
    category: "science",
    question: "Which sense organ detects light?",
    correct: "Eyes",
    wrong: ["Ears", "Nose", "Tongue"],
  },

  // ── Math (30) ─────────────────────────────────────────────────────
  {
    category: "math",
    question: "What is 12 × 8?",
    correct: "96",
    wrong: ["88", "108", "84"],
  },
  {
    category: "math",
    question: "What is 45 ÷ 9?",
    correct: "5",
    wrong: ["4", "6", "9"],
  },
  {
    category: "math",
    question: "What is 15% of 200?",
    correct: "30",
    wrong: ["15", "25", "40"],
  },
  {
    category: "math",
    question: "What is 7²?",
    correct: "49",
    wrong: ["14", "56", "42"],
  },
  {
    category: "math",
    question: "Solve: 3x = 21. What is x?",
    correct: "7",
    wrong: ["6", "8", "18"],
  },
  {
    category: "math",
    question: "What is 1/2 + 1/4?",
    correct: "3/4",
    wrong: ["1/4", "2/4", "1/6"],
  },
  {
    category: "math",
    question: "How many degrees are in a right angle?",
    correct: "90",
    wrong: ["45", "180", "360"],
  },
  {
    category: "math",
    question: "What is the perimeter of a square with side 6?",
    correct: "24",
    wrong: ["12", "36", "18"],
  },
  {
    category: "math",
    question: "What is 100 − 37?",
    correct: "63",
    wrong: ["67", "73", "53"],
  },
  {
    category: "math",
    question: "What is 9 × 9?",
    correct: "81",
    wrong: ["72", "99", "89"],
  },
  {
    category: "math",
    question: "Round 3.6 to the nearest whole number.",
    correct: "4",
    wrong: ["3", "3.5", "5"],
  },
  {
    category: "math",
    question: "What is the mean of 2, 4, and 6?",
    correct: "4",
    wrong: ["3", "5", "12"],
  },
  {
    category: "math",
    question: "How many sides does a hexagon have?",
    correct: "6",
    wrong: ["5", "7", "8"],
  },
  {
    category: "math",
    question: "What is 0.5 as a fraction?",
    correct: "1/2",
    wrong: ["1/5", "5/10 only", "2/5"],
  },
  {
    category: "math",
    question: "What is 8³?",
    correct: "512",
    wrong: ["24", "64", "256"],
  },
  {
    category: "math",
    question: "Solve: 50% of 80.",
    correct: "40",
    wrong: ["30", "50", "20"],
  },
  {
    category: "math",
    question: "What is the area of a rectangle 5 by 4?",
    correct: "20",
    wrong: ["9", "18", "24"],
  },
  {
    category: "math",
    question: "What is 11 × 11?",
    correct: "121",
    wrong: ["111", "131", "110"],
  },
  {
    category: "math",
    question: "What is √81?",
    correct: "9",
    wrong: ["8", "18", "41"],
  },
  {
    category: "math",
    question: "How many minutes are in 2.5 hours?",
    correct: "150",
    wrong: ["120", "180", "90"],
  },
  {
    category: "math",
    question: "What is 3/5 as a decimal?",
    correct: "0.6",
    wrong: ["0.3", "0.5", "0.35"],
  },
  {
    category: "math",
    question: "Solve: 14 + 29.",
    correct: "43",
    wrong: ["33", "42", "53"],
  },
  {
    category: "math",
    question: "What is the next number: 2, 4, 8, 16, ____?",
    correct: "32",
    wrong: ["24", "20", "18"],
  },
  {
    category: "math",
    question: "How many degrees in a full circle?",
    correct: "360",
    wrong: ["180", "90", "100"],
  },
  {
    category: "math",
    question: "What is 25 × 4?",
    correct: "100",
    wrong: ["50", "75", "125"],
  },
  {
    category: "math",
    question: "If a pizza is cut into 8 equal slices and you eat 3, what fraction remains?",
    correct: "5/8",
    wrong: ["3/8", "1/2", "3/5"],
  },
  {
    category: "math",
    question: "What is 1,000 ÷ 25?",
    correct: "40",
    wrong: ["25", "50", "400"],
  },
  {
    category: "math",
    question: "The median of 1, 3, 5, 7, 9 is ____.",
    correct: "5",
    wrong: ["3", "7", "4"],
  },
  {
    category: "math",
    question: "What is 2⁵?",
    correct: "32",
    wrong: ["10", "16", "64"],
  },
  {
    category: "math",
    question: "Solve: 60 ÷ 5 × 2.",
    correct: "24",
    wrong: ["6", "12", "48"],
  },

  // ── Geography (30) — “Where is this country located?” ─────────────
  {
    category: "geography",
    question: "Where is Japan located?",
    correct: "Asia",
    wrong: ["Europe", "Africa", "South America"],
  },
  {
    category: "geography",
    question: "Where is Brazil located?",
    correct: "South America",
    wrong: ["Africa", "Europe", "Asia"],
  },
  {
    category: "geography",
    question: "Where is Egypt located?",
    correct: "Africa",
    wrong: ["Asia", "Europe", "South America"],
  },
  {
    category: "geography",
    question: "Where is France located?",
    correct: "Europe",
    wrong: ["Asia", "Africa", "North America"],
  },
  {
    category: "geography",
    question: "Where is Canada located?",
    correct: "North America",
    wrong: ["Europe", "South America", "Asia"],
  },
  {
    category: "geography",
    question: "Where is Australia located?",
    correct: "Oceania",
    wrong: ["Asia", "Europe", "Africa"],
  },
  {
    category: "geography",
    question: "Where is India located?",
    correct: "Asia",
    wrong: ["Africa", "Europe", "South America"],
  },
  {
    category: "geography",
    question: "Where is Mexico located?",
    correct: "North America",
    wrong: ["South America", "Europe", "Africa"],
  },
  {
    category: "geography",
    question: "Where is Nigeria located?",
    correct: "Africa",
    wrong: ["Asia", "Europe", "South America"],
  },
  {
    category: "geography",
    question: "Where is Germany located?",
    correct: "Europe",
    wrong: ["Asia", "Africa", "North America"],
  },
  {
    category: "geography",
    question: "Where is Argentina located?",
    correct: "South America",
    wrong: ["Europe", "Africa", "Asia"],
  },
  {
    category: "geography",
    question: "Where is South Korea located?",
    correct: "Asia",
    wrong: ["Europe", "Oceania", "Africa"],
  },
  {
    category: "geography",
    question: "Where is Kenya located?",
    correct: "Africa",
    wrong: ["Asia", "Europe", "South America"],
  },
  {
    category: "geography",
    question: "Where is Spain located?",
    correct: "Europe",
    wrong: ["Africa", "Asia", "South America"],
  },
  {
    category: "geography",
    question: "Where is Chile located?",
    correct: "South America",
    wrong: ["North America", "Europe", "Africa"],
  },
  {
    category: "geography",
    question: "Where is Thailand located?",
    correct: "Asia",
    wrong: ["Africa", "Europe", "Oceania"],
  },
  {
    category: "geography",
    question: "Where is New Zealand located?",
    correct: "Oceania",
    wrong: ["Europe", "Asia", "South America"],
  },
  {
    category: "geography",
    question: "Where is Morocco located?",
    correct: "Africa",
    wrong: ["Europe", "Asia", "South America"],
  },
  {
    category: "geography",
    question: "Where is Italy located?",
    correct: "Europe",
    wrong: ["Asia", "Africa", "North America"],
  },
  {
    category: "geography",
    question: "Where is Peru located?",
    correct: "South America",
    wrong: ["Africa", "Asia", "Europe"],
  },
  {
    category: "geography",
    question: "Where is Saudi Arabia located?",
    correct: "Asia",
    wrong: ["Africa", "Europe", "Oceania"],
  },
  {
    category: "geography",
    question: "Where is Sweden located?",
    correct: "Europe",
    wrong: ["Asia", "North America", "Africa"],
  },
  {
    category: "geography",
    question: "Where is Colombia located?",
    correct: "South America",
    wrong: ["North America", "Africa", "Europe"],
  },
  {
    category: "geography",
    question: "Where is Vietnam located?",
    correct: "Asia",
    wrong: ["Africa", "Europe", "Oceania"],
  },
  {
    category: "geography",
    question: "Where is South Africa located?",
    correct: "Africa",
    wrong: ["Asia", "Europe", "South America"],
  },
  {
    category: "geography",
    question: "Where is Poland located?",
    correct: "Europe",
    wrong: ["Asia", "Africa", "North America"],
  },
  {
    category: "geography",
    question: "Where is Indonesia located?",
    correct: "Asia",
    wrong: ["Africa", "Europe", "South America"],
  },
  {
    category: "geography",
    question: "Where is Cuba located?",
    correct: "North America / Caribbean",
    wrong: ["South America", "Europe", "Africa"],
  },
  {
    category: "geography",
    question: "Where is Turkey located?",
    correct: "Europe and Asia",
    wrong: ["Only Africa", "Only South America", "Only Oceania"],
  },
  {
    category: "geography",
    question: "Where is Iceland located?",
    correct: "Europe",
    wrong: ["North America", "Asia", "Africa"],
  },
];

export function pickRandomKnowledgeCategory(): KnowledgeCategory {
  const i = Math.floor(Math.random() * KNOWLEDGE_CATEGORIES.length);
  return KNOWLEDGE_CATEGORIES[i]!;
}

export function pickKnowledgeQuestionForCategory(
  category: KnowledgeCategory,
): KnowledgeQuestion {
  const pool = KNOWLEDGE_QUESTIONS.filter((q) => q.category === category);
  const i = Math.floor(Math.random() * pool.length);
  return pool[i]!;
}

export function pickKnowledgeQuestion(): KnowledgeQuestion {
  return pickKnowledgeQuestionForCategory(pickRandomKnowledgeCategory());
}

export function knowledgeQuestionCount(): number {
  return KNOWLEDGE_QUESTIONS.length;
}
