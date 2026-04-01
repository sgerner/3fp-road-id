CREATE TABLE IF NOT EXISTS public.learn_categories (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.learn_subcategories (
    slug TEXT PRIMARY KEY,
    category_slug TEXT NOT NULL REFERENCES public.learn_categories(slug) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.learn_articles 
ADD COLUMN IF NOT EXISTS subcategory_slug TEXT REFERENCES public.learn_subcategories(slug) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

ALTER TABLE public.learn_article_revisions
ADD COLUMN IF NOT EXISTS subcategory_slug TEXT;


INSERT INTO public.learn_categories (slug, name)
SELECT DISTINCT category_slug, category_name FROM public.learn_articles 
WHERE category_slug IS NOT NULL 
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.learn_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learn_subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories viewable by everyone" ON public.learn_categories FOR SELECT USING (true);
CREATE POLICY "Subcategories viewable by everyone" ON public.learn_subcategories FOR SELECT USING (true);

CREATE POLICY "Categories insertable by authenticated" ON public.learn_categories FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Categories updatable by authenticated" ON public.learn_categories FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Categories deletable by authenticated" ON public.learn_categories FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Subcategories insertable by authenticated" ON public.learn_subcategories FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Subcategories updatable by authenticated" ON public.learn_subcategories FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Subcategories deletable by authenticated" ON public.learn_subcategories FOR DELETE USING (auth.role() = 'authenticated');;
