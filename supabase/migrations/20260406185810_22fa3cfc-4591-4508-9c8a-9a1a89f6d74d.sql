-- Add sector column to bookings table to track which physical space is being booked
ALTER TABLE public.bookings 
ADD COLUMN sector text NOT NULL DEFAULT 'projeto_vida';

-- Backfill existing quadra bookings based on event_type
UPDATE public.bookings 
SET sector = 'quadra' 
WHERE event_type IN ('esportivo', 'outros', 'externo');