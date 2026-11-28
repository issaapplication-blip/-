begin;
update public.hospitals
set address = case district
  when 'زحلة' then 'قضاء زحلة، محافظة البقاع، لبنان'
  when 'عاليه' then 'قضاء عاليه، محافظة جبل لبنان، لبنان'
  when 'بعبدا' then 'قضاء بعبدا، محافظة جبل لبنان، لبنان'
  when 'الشوف' then 'قضاء الشوف، محافظة جبل لبنان، لبنان'
  when 'جبيل' then 'قضاء جبيل، محافظة جبل لبنان، لبنان'
  else address
end,
locality = null,
updated_at = now()
where slug in (
  'taanayel-general','khoury-general','bekaa-hospital','tel-chiha','nazareth-hospital',
  'bashamoun-specialized','watani-hospital','lebanese-eye-hospital','medical-2000',
  'azzounieh-sanatorium','jabal-hospital','iman-hospital','bahman-hospital',
  'rasoul-azam','sahel-hospital','dr-mohammad-khaled','baakleen-hospital',
  'hopital-maritime-jbeil','saint-michel-amchit'
);
commit;