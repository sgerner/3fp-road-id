-- Create group_outreach table to track contacts with unclaimed groups
CREATE TABLE IF NOT EXISTS public.group_outreach (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    contacted_at timestamptz NOT NULL DEFAULT now(),
    contacted_by uuid NOT NULL REFERENCES auth.users(id), -- Admin who did the outreach
    contact_method text NOT NULL, -- 'email', 'instagram_dm', 'facebook_message', etc.
    message_content text,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add enrichment and completeness tracking for groups
CREATE TABLE IF NOT EXISTS public.group_enrichment (
    group_id uuid PRIMARY KEY REFERENCES public.groups(id) ON DELETE CASCADE,
    last_enriched_at timestamptz,
    enrichment_data jsonb DEFAULT '{}'::jsonb, -- Store results from the enrichment pipeline
    completeness_score float4 DEFAULT 0, -- 0 to 1 calculation of profile completeness
    outreach_priority float4 DEFAULT 0, -- Calculated priority (e.g., size * completeness)
    outreach_status text DEFAULT 'pending' CHECK (outreach_status IN ('pending', 'contacted', 'claimed', 'ignored')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create index for faster filtering on outreach status and group_id
CREATE INDEX IF NOT EXISTS idx_group_outreach_group_id ON public.group_outreach(group_id);
CREATE INDEX IF NOT EXISTS idx_group_enrichment_status ON public.group_enrichment(outreach_status);

-- Enable RLS
ALTER TABLE public.group_outreach ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_enrichment ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage these tables
CREATE POLICY admin_outreach_all ON public.group_outreach
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND admin = true));

CREATE POLICY admin_enrichment_all ON public.group_enrichment
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND admin = true));

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Check if triggers already exist to avoid errors during re-runs
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_group_outreach_updated_at') THEN
        CREATE TRIGGER set_group_outreach_updated_at
            BEFORE UPDATE ON public.group_outreach
            FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_group_enrichment_updated_at') THEN
        CREATE TRIGGER set_group_enrichment_updated_at
            BEFORE UPDATE ON public.group_enrichment
            FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;
