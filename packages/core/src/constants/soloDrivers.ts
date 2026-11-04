// Pilotos do modo solo (v1.4.4): nome, personalidade e talento de referência do grid inicial
// talento null = piloto do solo fora do grid inicial (reserva, F2, livre)
export interface SoloDriver {
  name: string;
  personalidade: string;
  talento: number | null;
}

export const SOLO_DRIVERS: SoloDriver[] = [
  {
    "name": "João Senna",
    "personalidade": "ambicioso",
    "talento": 93
  },
  {
    "name": "Klaus Schumacher",
    "personalidade": "perfeccionista",
    "talento": 92
  },
  {
    "name": "Oliver Hamilton",
    "personalidade": "calmo",
    "talento": 91
  },
  {
    "name": "Daan Verstappen",
    "personalidade": "explosivo",
    "talento": 90
  },
  {
    "name": "James Stewart",
    "personalidade": "perfeccionista",
    "talento": 88
  },
  {
    "name": "Martín Ascari",
    "personalidade": "leal",
    "talento": 87
  },
  {
    "name": "Thomas Vettel",
    "personalidade": "perfeccionista",
    "talento": 86
  },
  {
    "name": "Andreas Lauda",
    "personalidade": "calmo",
    "talento": 85
  },
  {
    "name": "Mikko Häkkinen",
    "personalidade": "calmo",
    "talento": 83
  },
  {
    "name": "Alistair Hill",
    "personalidade": "leal",
    "talento": 82
  },
  {
    "name": "Gareth Mansell",
    "personalidade": "explosivo",
    "talento": 82
  },
  {
    "name": "Richard Peterson",
    "personalidade": "leal",
    "talento": 81
  },
  {
    "name": "Jack Brabham",
    "personalidade": "perfeccionista",
    "talento": 80
  },
  {
    "name": "Oliver Button",
    "personalidade": "calmo",
    "talento": 80
  },
  {
    "name": "Erik Rosberg",
    "personalidade": "perfeccionista",
    "talento": 80
  },
  {
    "name": "Daniel Barrichello",
    "personalidade": "leal",
    "talento": 80
  },
  {
    "name": "David Coulthard",
    "personalidade": "calmo",
    "talento": 77
  },
  {
    "name": "Jari Räikkönen",
    "personalidade": "calmo",
    "talento": 77
  },
  {
    "name": "Santiago Montoya",
    "personalidade": "explosivo",
    "talento": 76
  },
  {
    "name": "Liam Piastri",
    "personalidade": "calmo",
    "talento": 76
  },
  {
    "name": "Antoine Leclerc",
    "personalidade": "explosivo",
    "talento": 75
  },
  {
    "name": "Marcelo Massa",
    "personalidade": "leal",
    "talento": 74
  },
  {
    "name": "François Alesi",
    "personalidade": "explosivo",
    "talento": 72
  },
  {
    "name": "Lucas Bortoleto",
    "personalidade": "calmo",
    "talento": 72
  },
  {
    "name": "Yanis Hadjar",
    "personalidade": "explosivo",
    "talento": 71
  },
  {
    "name": "Jack Ricciardo",
    "personalidade": "ambicioso",
    "talento": 70
  },
  {
    "name": "Andrea Antonelli",
    "personalidade": "explosivo",
    "talento": 70
  },
  {
    "name": "Harry Bearman",
    "personalidade": "ambicioso",
    "talento": 68
  },
  {
    "name": "Marco Patrese",
    "personalidade": "leal",
    "talento": 66
  },
  {
    "name": "Rafael Nasr",
    "personalidade": "leal",
    "talento": 66
  },
  {
    "name": "Diego Fangio",
    "personalidade": "calmo",
    "talento": null
  },
  {
    "name": "Julien Prost",
    "personalidade": "perfeccionista",
    "talento": null
  },
  {
    "name": "Lukas Clark",
    "personalidade": "leal",
    "talento": null
  },
  {
    "name": "Javier Alonso",
    "personalidade": "ambicioso",
    "talento": null
  },
  {
    "name": "Ricardo Piquet",
    "personalidade": "explosivo",
    "talento": null
  },
  {
    "name": "William Moss",
    "personalidade": "calmo",
    "talento": null
  },
  {
    "name": "Eduardo Fittipaldi",
    "personalidade": "leal",
    "talento": null
  },
  {
    "name": "Lukas Rindt",
    "personalidade": "ambicioso",
    "talento": null
  },
  {
    "name": "Marc Villeneuve",
    "personalidade": "explosivo",
    "talento": null
  },
  {
    "name": "Anthony Andretti",
    "personalidade": "ambicioso",
    "talento": null
  },
  {
    "name": "Jean Arnoux",
    "personalidade": "ambicioso",
    "talento": null
  },
  {
    "name": "Thomas Hunt",
    "personalidade": "explosivo",
    "talento": null
  },
  {
    "name": "Lachlan Webber",
    "personalidade": "ambicioso",
    "talento": null
  },
  {
    "name": "Wolfgang Berger",
    "personalidade": "leal",
    "talento": null
  },
  {
    "name": "Esteban Reutemann",
    "personalidade": "perfeccionista",
    "talento": null
  },
  {
    "name": "Nathan Jones",
    "personalidade": "ambicioso",
    "talento": null
  },
  {
    "name": "Oliver Surtees",
    "personalidade": "perfeccionista",
    "talento": null
  },
  {
    "name": "Rhys Norris",
    "personalidade": "perfeccionista",
    "talento": null
  },
  {
    "name": "Arthur Russell",
    "personalidade": "ambicioso",
    "talento": null
  },
  {
    "name": "Antti Kovalainen",
    "personalidade": "calmo",
    "talento": null
  },
  {
    "name": "Javier Sainz Jr.",
    "personalidade": "perfeccionista",
    "talento": null
  },
  {
    "name": "Alejandro Pérez",
    "personalidade": "calmo",
    "talento": null
  },
  {
    "name": "Eero Bottas",
    "personalidade": "leal",
    "talento": null
  },
  {
    "name": "Callum McLaren",
    "personalidade": "perfeccionista",
    "talento": null
  },
  {
    "name": "Tama Hulme",
    "personalidade": "calmo",
    "talento": null
  },
  {
    "name": "Jakub Kubica",
    "personalidade": "perfeccionista",
    "talento": null
  },
  {
    "name": "Stefan Heidfeld",
    "personalidade": "calmo",
    "talento": null
  },
  {
    "name": "Sean Irvine",
    "personalidade": "explosivo",
    "talento": null
  },
  {
    "name": "Maximilian Frentzen",
    "personalidade": "ambicioso",
    "talento": null
  },
  {
    "name": "Théo Gasly",
    "personalidade": "explosivo",
    "talento": null
  },
  {
    "name": "James Brooks",
    "personalidade": "calmo",
    "talento": null
  },
  {
    "name": "Oliver Hawthorn",
    "personalidade": "explosivo",
    "talento": null
  },
  {
    "name": "Michael Cheever",
    "personalidade": "ambicioso",
    "talento": null
  },
  {
    "name": "Giovanni Farina",
    "personalidade": "perfeccionista",
    "talento": null
  },
  {
    "name": "Rafael Câmara",
    "personalidade": "ambicioso",
    "talento": null
  },
  {
    "name": "Marco Fornaroli",
    "personalidade": "perfeccionista",
    "talento": null
  },
  {
    "name": "Isaac Lindblad",
    "personalidade": "leal",
    "talento": null
  },
  {
    "name": "Josh Lawson",
    "personalidade": "ambicioso",
    "talento": null
  },
  {
    "name": "Tomás Colapinto",
    "personalidade": "explosivo",
    "talento": null
  },
  {
    "name": "Diego Varrone",
    "personalidade": "leal",
    "talento": null
  },
  {
    "name": "Mason Doohan",
    "personalidade": "ambicioso",
    "talento": null
  },
  {
    "name": "Ren Iwasa",
    "personalidade": "perfeccionista",
    "talento": null
  },
  {
    "name": "Conor Dunne",
    "personalidade": "calmo",
    "talento": null
  },
  {
    "name": "Elias Beganovic",
    "personalidade": "leal",
    "talento": null
  },
  {
    "name": "Kai Crawford",
    "personalidade": "ambicioso",
    "talento": null
  },
  {
    "name": "Nils Stenshorne",
    "personalidade": "calmo",
    "talento": null
  },
  {
    "name": "Petar Tsolov",
    "personalidade": "perfeccionista",
    "talento": null
  },
  {
    "name": "Luca van Hoepen",
    "personalidade": "leal",
    "talento": null
  },
  {
    "name": "Max Goethe",
    "personalidade": "perfeccionista",
    "talento": null
  },
  {
    "name": "Mateo Herta",
    "personalidade": "calmo",
    "talento": null
  },
  {
    "name": "Noah Leon",
    "personalidade": "explosivo",
    "talento": null
  },
  {
    "name": "Tasan Inthraphuvasak",
    "personalidade": "leal",
    "talento": null
  }
];
