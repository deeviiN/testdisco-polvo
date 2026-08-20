import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search, MapPin, X } from "lucide-react";

type School = {
  id: string;
  name: string;
  city: string;
  state: string;
  inep_code: string | null;
  network: string;
  is_active: boolean;
  logo_url: string | null;
  address: string | null;
};

interface SchoolSearchProps {
  onSelect: (school: School) => void;
  selected?: School | null;
}

export function SchoolSearch({ onSelect, selected }: SchoolSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<School[]>([]);
  const [allSchools, setAllSchools] = useState<School[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchAllSchools = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("search_schools_public", { 
        search_query: "" 
      });
      
      if (error) {
        console.error("Error fetching all schools:", error);
      } else {
        setAllSchools(data || []);
      }
      setLoading(false);
    };

    fetchAllSchools();
  }, []);

  useEffect(() => {
    const fetchResults = async () => {
      if (query.trim() === "" && allSchools.length > 0) {
        setResults(allSchools.slice(0, 50));
        return;
      }

      setLoading(true);
      const { data } = await supabase.rpc("search_schools_public", { 
        search_query: query.trim() 
      });
      
      setResults(data || []);
      setLoading(false);
      setIsOpen(true);
    };

    const timer = setTimeout(fetchResults, 300);
    return () => clearTimeout(timer);
  }, [query, allSchools]);

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-primary/5 border border-primary/20 p-3 animate-scale-in">
        <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shrink-0">
          <MapPin className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{selected.name}</p>
          <p className="text-xs text-muted-foreground">{selected.city} — {selected.state}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            onSelect(null as unknown as School);
            setQuery("");
          }}
          className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar escola (nome, cidade ou código INEP)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          className="pl-10 h-12 rounded-xl bg-secondary/50 border-0 focus-visible:ring-primary/30 focus-visible:ring-offset-0"
        />
      </div>
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border-0 bg-card shadow-card-hover max-h-60 overflow-y-auto animate-fade-in">
          {results.map((school) => (
            <button
              key={school.id}
              type="button"
              className="w-full text-left px-4 py-3 hover:bg-primary/5 transition-colors border-b border-border/50 last:border-0 first:rounded-t-xl last:rounded-b-xl"
              onMouseDown={() => {
                onSelect(school);
                setIsOpen(false);
                setQuery("");
              }}
            >
              <p className="font-semibold text-sm">{school.name}</p>
              <p className="text-xs text-muted-foreground">{school.city} — {school.state}</p>
            </button>
          ))}
        </div>
      )}
      {isOpen && query.trim() !== "" && results.length === 0 && !loading && (
        <div className="absolute z-50 mt-2 w-full rounded-xl bg-card shadow-card-hover p-6 text-center animate-fade-in">
          <p className="text-sm text-muted-foreground">Nenhuma escola encontrada</p>
          <p className="text-xs text-muted-foreground mt-1">Tente buscar pela sigla (ex: EEEP, EE, CE) ou parte do nome</p>
        </div>
      )}
    </div>
  );
}
