import fs from 'fs';
import path from 'path';

export interface Agency {
    id: string;
    name: string;
    score: number;
    color?: string;
    history: number[]; // Performance history (last 12 months)
}

// Initial Default Agencies
const INITIAL_AGENCIES: Agency[] = [
    {
        id: 'user-agency-alpha',
        name: 'Alpha Collections',
        score: 92,
        history: [88, 85, 90, 89, 92, 91, 93, 90, 88, 92, 94, 92]
    },
    {
        id: 'user-agency-beta',
        name: 'Beta Recovery',
        score: 78,
        history: [70, 72, 75, 74, 76, 78, 77, 79, 80, 78, 77, 78]
    },
    {
        id: "user-agency-gamma",
        name: "Gamma Partners",
        score: 60,
        history: [55, 58, 60, 59, 61, 60, 58, 59, 62, 60, 61, 60]
    }
];

const DATA_FILE = path.join(process.cwd(), 'data', 'agencies.json');

// Helper to ensure data directory exists
const ensureDataFile = () => {
    try {
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(DATA_FILE, JSON.stringify(INITIAL_AGENCIES, null, 2));
        }
    } catch (error) {
        console.error("Failed to initialize agency data file:", error);
    }
};

export const getAgencies = (): Agency[] => {
    ensureDataFile();
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf-8');
        if (!data.trim()) return INITIAL_AGENCIES;
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading agencies:", error);
        return INITIAL_AGENCIES;
    }
};

export const getAgencyById = (id: string): Agency | undefined => {
    const agencies = getAgencies();
    return agencies.find(a => a.id === id);
};

export const saveAgencies = (agencies: Agency[]) => {
    ensureDataFile();
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(agencies, null, 2));
    } catch (error) {
        console.error("Error writing agencies:", error);
    }
};

export const addAgency = (name: string) => {
    const agencies = getAgencies();
    const id = `user-agency-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

    // New agencies start with 0 score and flat 0 history
    const history = Array(12).fill(0);

    const newAgency: Agency = {
        id,
        name,
        score: 60,
        history
    };

    agencies.push(newAgency);
    saveAgencies(agencies);
    return newAgency;
};

export const removeAgency = (id: string) => {
    let agencies = getAgencies();
    agencies = agencies.filter(a => a.id !== id);
    saveAgencies(agencies);
};

export const resetSystemAgencies = () => {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(INITIAL_AGENCIES, null, 2));
    } catch (error) {
        console.error("Error resetting agencies:", error);
    }
};
