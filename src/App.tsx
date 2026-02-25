/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';
import { 
  Plane, 
  Calendar, 
  Wallet, 
  Compass, 
  MapPin, 
  Loader2, 
  ChevronRight,
  Palmtree,
  Mountain,
  History,
  Utensils,
  Heart,
  Activity,
  Share2,
  Save,
  Trash2,
  Edit3,
  X,
  Map as MapIcon,
  ExternalLink,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix for Leaflet marker icons in Vite
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIconRetina,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

type TripType = 'adventurous' | 'relax' | 'cultural' | 'foodie';

interface TripDetails {
  destination: string;
  duration: number;
  budget: string;
  type: TripType;
  interests: string[];
  activities: string[];
}

interface SavedTrip extends TripDetails {
  id: string;
  title: string;
  content: string;
  created_at: string;
  locations?: { lat: number; lng: number; name: string }[];
}

const TRIP_TYPES = [
  { id: 'adventurous', label: 'Avventuroso', icon: Mountain, color: 'text-orange-500' },
  { id: 'relax', label: 'Relax', icon: Palmtree, color: 'text-blue-500' },
  { id: 'cultural', label: 'Culturale', icon: History, color: 'text-purple-500' },
  { id: 'foodie', label: 'Gastronomico', icon: Utensils, color: 'text-emerald-500' },
] as const;

const INTERESTS = ['Gastronomia', 'Arte', 'Natura', 'Avventura', 'Vita Notturna', 'Shopping', 'Storia', 'Relax'];
const ACTIVITY_TYPES = ['Visite Guidate', 'Escursioni', 'Corsi di Cucina', 'Esplorazione Indipendente', 'Sport Acquatici', 'Musei'];

// Helper to center map
function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  map.setView(center, zoom);
  return null;
}

export default function App() {
  const [details, setDetails] = useState<TripDetails>({
    destination: '',
    duration: 3,
    budget: 'medio',
    type: 'cultural',
    interests: [],
    activities: []
  });
  const [itinerary, setItinerary] = useState<string | null>(null);
  const [locations, setLocations] = useState<{ lat: number; lng: number; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [sharedTripId, setSharedTripId] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Load shared trip if ID in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('trip');
    if (id) {
      fetchTrip(id);
    }
    fetchSavedTrips();
  }, []);

  const fetchTrip = async (id: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/itineraries/${id}`);
      if (!res.ok) throw new Error("Trip not found");
      const data = await res.json();
      setItinerary(data.content);
      setDetails({
        destination: data.destination,
        duration: data.duration,
        budget: data.budget,
        type: data.type,
        interests: data.interests,
        activities: data.activities
      });
      setSharedTripId(id);
    } catch (err) {
      setError("Impossibile caricare l'itinerario condiviso.");
    } finally {
      setLoading(false);
    }
  };

  const fetchSavedTrips = async () => {
    try {
      const res = await fetch('/api/itineraries');
      const data = await res.json();
      setSavedTrips(data);
    } catch (err) {
      console.error("Error fetching saved trips", err);
    }
  };

  const generateItinerary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!details.destination) return;

    setLoading(true);
    setError(null);
    setItinerary(null);
    setLocations([]);
    setSharedTripId(null);

    try {
      const prompt = `Crea un itinerario di viaggio dettagliato giorno per giorno per la seguente destinazione: ${details.destination}.
      Durata: ${details.duration} giorni.
      Budget: ${details.budget}.
      Tipologia di viaggio: ${details.type}.
      Interessi: ${details.interests.join(', ')}.
      Attività preferite: ${details.activities.join(', ')}.
      
      L'itinerario deve includere:
      1. Suggerimenti specifici per l'alloggio (hotel, ostelli, Airbnb) basati sul budget (${details.budget}).
      2. Suggerimenti per il trasporto (voli, treni, noleggio auto, mezzi pubblici locali).
      3. Itinerario giornaliero dettagliato (Mattina, Pomeriggio, Sera).
      4. Un consiglio "pro" o una curiosità locale per ogni giorno.
      
      IMPORTANTE: Alla fine dell'itinerario, aggiungi una sezione chiamata "COORDINATE" con un elenco JSON di massimo 5 luoghi principali menzionati, nel formato:
      [{"name": "Nome Luogo", "lat": 0.0, "lng": 0.0}]
      
      Usa il formato Markdown per tutto il resto.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          tools: [{ googleMaps: {} }]
        }
      });

      if (response.text) {
        // Extract JSON coordinates if present
        const jsonMatch = response.text.match(/\[\s*{\s*"name":[\s\S]*?}\s*\]/);
        let cleanText = response.text;
        if (jsonMatch) {
          try {
            const locs = JSON.parse(jsonMatch[0]);
            setLocations(locs);
            cleanText = response.text.replace(jsonMatch[0], '').replace('COORDINATE', '');
          } catch (e) {
            console.error("Failed to parse locations", e);
          }
        }
        setItinerary(cleanText);
      } else {
        throw new Error("Nessuna risposta ricevuta dall'IA.");
      }
    } catch (err) {
      console.error(err);
      setError("Si è verificato un errore durante la generazione. Riprova più tardi.");
    } finally {
      setLoading(false);
    }
  };

  const saveTrip = async () => {
    if (!itinerary) return;
    try {
      const res = await fetch('/api/itineraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...details,
          content: itinerary,
          title: `Viaggio a ${details.destination}`
        })
      });
      const data = await res.json();
      setSharedTripId(data.id);
      fetchSavedTrips();
    } catch (err) {
      setError("Errore durante il salvataggio.");
    }
  };

  const deleteTrip = async (id: string) => {
    try {
      await fetch(`/api/itineraries/${id}`, { method: 'DELETE' });
      fetchSavedTrips();
    } catch (err) {
      console.error(err);
    }
  };

  const shareTrip = () => {
    if (!sharedTripId) return;
    const url = `${window.location.origin}?trip=${sharedTripId}`;
    navigator.clipboard.writeText(url);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const toggleInterest = (interest: string) => {
    setDetails(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest]
    }));
  };

  const toggleActivity = (activity: string) => {
    setDetails(prev => ({
      ...prev,
      activities: prev.activities.includes(activity)
        ? prev.activities.filter(a => a !== activity)
        : [...prev.activities, activity]
    }));
  };

  const mapCenter = useMemo(() => {
    if (locations.length > 0) return [locations[0].lat, locations[0].lng] as [number, number];
    return [41.9028, 12.4964] as [number, number]; // Default Rome
  }, [locations]);

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#1A1A1A] font-sans selection:bg-orange-100">
      {/* Header */}
      <header className="border-b border-black/5 bg-white/80 backdrop-blur-md sticky top-0 z-[1000]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.location.href = '/'}>
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <Plane className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight">Vagabond</span>
          </div>
          <nav className="flex items-center gap-6 text-sm font-medium">
            <button 
              onClick={() => setShowSaved(true)}
              className="flex items-center gap-2 text-black/60 hover:text-black transition-colors"
            >
              <Heart className="w-4 h-4" /> I miei viaggi
            </button>
            <a href="#" className="hidden md:block text-black/60 hover:text-black transition-colors">Supporto</a>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid lg:grid-cols-[450px_1fr] gap-12 items-start">
          
          {/* Form Section */}
          <section className="space-y-8">
            <div className="space-y-2">
              <h1 className="text-4xl font-serif font-medium leading-tight">
                Pianifica il tuo <br />
                <span className="italic text-orange-600">viaggio su misura.</span>
              </h1>
            </div>

            <form onSubmit={generateItinerary} className="space-y-6 bg-white p-8 rounded-3xl border border-black/5 shadow-sm">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                  <MapPin className="w-3 h-3" /> Destinazione
                </label>
                <input
                  type="text"
                  placeholder="Es: Tokyo, Parigi, Bali..."
                  className="w-full bg-transparent border-b-2 border-black/10 py-2 text-xl focus:outline-none focus:border-black transition-colors placeholder:text-black/10"
                  value={details.destination}
                  onChange={(e) => setDetails({ ...details, destination: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                    <Calendar className="w-3 h-3" /> Durata (giorni)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    className="w-full bg-transparent border-b-2 border-black/10 py-2 text-xl focus:outline-none focus:border-black transition-colors"
                    value={details.duration}
                    onChange={(e) => setDetails({ ...details, duration: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                    <Wallet className="w-3 h-3" /> Budget
                  </label>
                  <select
                    className="w-full bg-transparent border-b-2 border-black/10 py-2 text-xl focus:outline-none focus:border-black transition-colors appearance-none cursor-pointer"
                    value={details.budget}
                    onChange={(e) => setDetails({ ...details, budget: e.target.value })}
                  >
                    <option value="economico">Economico</option>
                    <option value="medio">Medio</option>
                    <option value="lusso">Lusso</option>
                  </select>
                </div>
              </div>

              {/* Advanced Filters: Interests */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                  <Heart className="w-3 h-3" /> Interessi
                </label>
                <div className="flex flex-wrap gap-2">
                  {INTERESTS.map(interest => (
                    <button
                      key={interest}
                      type="button"
                      onClick={() => toggleInterest(interest)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                        details.interests.includes(interest)
                          ? "bg-black text-white border-black"
                          : "bg-white text-black/60 border-black/5 hover:border-black/20"
                      )}
                    >
                      {interest}
                    </button>
                  ))}
                </div>
              </div>

              {/* Advanced Filters: Activities */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                  <Activity className="w-3 h-3" /> Attività
                </label>
                <div className="flex flex-wrap gap-2">
                  {ACTIVITY_TYPES.map(activity => (
                    <button
                      key={activity}
                      type="button"
                      onClick={() => toggleActivity(activity)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                        details.activities.includes(activity)
                          ? "bg-orange-500 text-white border-orange-500"
                          : "bg-white text-black/60 border-black/5 hover:border-black/20"
                      )}
                    >
                      {activity}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                  <Compass className="w-3 h-3" /> Stile di Viaggio
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {TRIP_TYPES.map((type) => {
                    const Icon = type.icon;
                    const isActive = details.type === type.id;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setDetails({ ...details, type: type.id as TripType })}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                          isActive 
                            ? "border-black bg-black text-white shadow-md" 
                            : "border-black/5 bg-white hover:border-black/20"
                        )}
                      >
                        <Icon className={cn("w-5 h-5", isActive ? "text-white" : type.color)} />
                        <span className="text-sm font-medium">{type.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-xl shadow-black/10"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generazione...
                  </>
                ) : (
                  <>
                    Crea Itinerario
                    <ChevronRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>
          </section>

          {/* Result Section */}
          <section className="space-y-8">
            <AnimatePresence mode="wait">
              {!itinerary && !loading && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="h-[600px] flex flex-col items-center justify-center text-center space-y-6 p-12 border-2 border-dashed border-black/5 rounded-[40px]"
                >
                  <Compass className="w-12 h-12 text-orange-500" />
                  <div className="space-y-2">
                    <h3 className="text-2xl font-serif">Inizia la tua avventura</h3>
                    <p className="text-black/40 max-w-xs mx-auto">
                      Inserisci i dettagli del tuo viaggio per generare un itinerario completo di alloggi e trasporti.
                    </p>
                  </div>
                </motion.div>
              )}

              {loading && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-[600px] flex flex-col items-center justify-center space-y-8"
                >
                  <div className="relative">
                    <div className="w-24 h-24 border-4 border-black/5 rounded-full animate-spin border-t-orange-500" />
                    <Plane className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-black" />
                  </div>
                  <p className="text-black/40 animate-pulse font-medium">Stiamo disegnando il tuo viaggio perfetto...</p>
                </motion.div>
              )}

              {itinerary && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-8"
                >
                  {/* Map Integration */}
                  {locations.length > 0 && (
                    <div className="h-[300px] w-full rounded-[32px] overflow-hidden border border-black/5 shadow-sm z-0">
                      <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <ChangeView center={mapCenter} zoom={13} />
                        {locations.map((loc, i) => (
                          <Marker key={i} position={[loc.lat, loc.lng]}>
                            <Popup>{loc.name}</Popup>
                          </Marker>
                        ))}
                      </MapContainer>
                    </div>
                  )}

                  <div className="bg-white p-8 md:p-12 rounded-[40px] border border-black/5 shadow-sm relative overflow-hidden">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-12 border-b border-black/5 pb-8">
                      <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-widest text-orange-500">Itinerario Vagabond</span>
                        <h2 className="text-3xl font-serif">{details.destination}</h2>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!sharedTripId ? (
                          <button 
                            onClick={saveTrip}
                            className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-full text-xs font-bold uppercase tracking-wider hover:bg-orange-600 transition-colors"
                          >
                            <Save className="w-3.5 h-3.5" /> Salva Viaggio
                          </button>
                        ) : (
                          <button 
                            onClick={shareTrip}
                            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-full text-xs font-bold uppercase tracking-wider hover:bg-orange-600 transition-colors"
                          >
                            {copySuccess ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                            {copySuccess ? "Copiato!" : "Condividi Link"}
                          </button>
                        )}
                        <button 
                          onClick={() => window.print()}
                          className="flex items-center gap-2 px-4 py-2 bg-black/5 text-black rounded-full text-xs font-bold uppercase tracking-wider hover:bg-black/10 transition-colors"
                        >
                          Stampa
                        </button>
                      </div>
                    </div>

                    <div className="prose prose-slate max-w-none markdown-body">
                      <Markdown>{itinerary}</Markdown>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </main>

      {/* Saved Trips Modal */}
      <AnimatePresence>
        {showSaved && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-8 border-b border-black/5 flex items-center justify-between">
                <h2 className="text-2xl font-serif">I miei viaggi salvati</h2>
                <button onClick={() => setShowSaved(false)} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-4">
                {savedTrips.length === 0 ? (
                  <div className="text-center py-12 text-black/40">
                    Non hai ancora salvato nessun viaggio.
                  </div>
                ) : (
                  savedTrips.map(trip => (
                    <div key={trip.id} className="group p-6 border border-black/5 rounded-3xl hover:border-black/20 transition-all flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <h4 className="font-bold text-lg">{trip.title}</h4>
                        <p className="text-sm text-black/40">
                          {trip.destination} • {trip.duration} giorni • {new Date(trip.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setItinerary(trip.content);
                            setDetails({
                              destination: trip.destination,
                              duration: trip.duration,
                              budget: trip.budget,
                              type: trip.type as TripType,
                              interests: trip.interests,
                              activities: trip.activities
                            });
                            setSharedTripId(trip.id);
                            setShowSaved(false);
                          }}
                          className="p-3 bg-black/5 rounded-xl hover:bg-black hover:text-white transition-all"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => deleteTrip(trip.id)}
                          className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="border-t border-black/5 py-12 mt-20">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2 opacity-50">
            <Plane className="w-5 h-5" />
            <span className="font-bold tracking-tight">Vagabond</span>
          </div>
          <p className="text-black/30 text-sm">© 2024 Vagabond AI Travel.</p>
        </div>
      </footer>
    </div>
  );
}
