update public.sports
set extra_fields = case balance_profile
  when 'handball' then jsonb_build_array(
    jsonb_build_object('id','role','label','Role','type','select','options',jsonb_build_array('Gardien','Ailier','Arriere','Demi-centre','Pivot'),'priority',1),
    jsonb_build_object('id','goals','label','Buts','type','number','min',0,'max',40,'step',1,'chart',true,'aggregate','sum','priority',2),
    jsonb_build_object('id','shots','label','Tirs','type','number','min',0,'max',60,'step',1,'chart',true,'aggregate','sum','priority',3),
    jsonb_build_object('id','assists','label','Passes decisives','type','number','min',0,'max',30,'step',1,'chart',true,'aggregate','sum','priority',4),
    jsonb_build_object('id','defensive_stops','label','Stops defensifs','type','number','min',0,'max',50,'step',1,'chart',true,'aggregate','sum','priority',5),
    jsonb_build_object('id','saves','label','Arrets gardien','type','number','min',0,'max',60,'step',1,'chart',true,'aggregate','sum','priority',6,'visibleWhen',jsonb_build_object('field','role','equals','Gardien'))
  )
  when 'rugby' then jsonb_build_array(
    jsonb_build_object('id','role','label','Role','type','select','options',jsonb_build_array('Avant','Demi','Centre','Ailier','Arriere'),'priority',1),
    jsonb_build_object('id','tries','label','Essais','type','number','min',0,'max',10,'step',1,'chart',true,'aggregate','sum','priority',2),
    jsonb_build_object('id','carries','label','Ballons portes','type','number','min',0,'max',80,'step',1,'chart',true,'aggregate','sum','priority',3),
    jsonb_build_object('id','meters_carried','label','Metres gagnes','type','number','unit','m','min',0,'max',1000,'step',1,'chart',true,'aggregate','sum','priority',4),
    jsonb_build_object('id','tackles','label','Plaquages','type','number','min',0,'max',80,'step',1,'chart',true,'aggregate','sum','priority',5),
    jsonb_build_object('id','turnovers_won','label','Turnovers gagnes','type','number','min',0,'max',30,'step',1,'chart',true,'aggregate','sum','priority',6)
  )
  when 'volleyball' then jsonb_build_array(
    jsonb_build_object('id','role','label','Role','type','select','options',jsonb_build_array('Passeur','Receptionneur','Central','Pointu','Libero'),'priority',1),
    jsonb_build_object('id','kills','label','Attaques gagnantes','type','number','min',0,'max',80,'step',1,'chart',true,'aggregate','sum','priority',2),
    jsonb_build_object('id','aces','label','Aces','type','number','min',0,'max',30,'step',1,'chart',true,'aggregate','sum','priority',3),
    jsonb_build_object('id','blocks','label','Blocs','type','number','min',0,'max',40,'step',1,'chart',true,'aggregate','sum','priority',4),
    jsonb_build_object('id','digs','label','Defenses relevees','type','number','min',0,'max',100,'step',1,'chart',true,'aggregate','sum','priority',5),
    jsonb_build_object('id','serve_errors','label','Fautes service','type','number','min',0,'max',30,'step',1,'chart',true,'aggregate','sum','priority',6,'higherIsBetter',false)
  )
  when 'racket_fast' then jsonb_build_array(
    jsonb_build_object('id','match_result','label','Resultat','type','select','options',jsonb_build_array('Victoire','Defaite','Nul','Entrainement'),'priority',1),
    jsonb_build_object('id','sets_won','label','Sets gagnes','type','number','min',0,'max',10,'step',1,'chart',true,'aggregate','sum','priority',2),
    jsonb_build_object('id','direct_points','label','Points directs','type','number','min',0,'max',120,'step',1,'chart',true,'aggregate','sum','priority',3),
    jsonb_build_object('id','rally_quality_score','label','Qualite echanges','type','number','min',1,'max',10,'step',1,'chart',true,'aggregate','avg','priority',4),
    jsonb_build_object('id','unforced_errors','label','Fautes directes','type','number','min',0,'max',160,'step',1,'chart',true,'aggregate','sum','priority',5,'higherIsBetter',false)
  )
  when 'padel' then jsonb_build_array(
    jsonb_build_object('id','match_result','label','Resultat','type','select','options',jsonb_build_array('Victoire','Defaite','Entrainement'),'priority',1),
    jsonb_build_object('id','sets_won','label','Sets gagnes','type','number','min',0,'max',10,'step',1,'chart',true,'aggregate','sum','priority',2),
    jsonb_build_object('id','break_points','label','Breaks convertis','type','number','min',0,'max',30,'step',1,'chart',true,'aggregate','sum','priority',3),
    jsonb_build_object('id','net_points','label','Points au filet','type','number','min',0,'max',120,'step',1,'chart',true,'aggregate','sum','priority',4),
    jsonb_build_object('id','unforced_errors','label','Fautes directes','type','number','min',0,'max',120,'step',1,'chart',true,'aggregate','sum','priority',5,'higherIsBetter',false)
  )
  else extra_fields
end,
updated_at = now()
where balance_profile in ('handball','rugby','volleyball','racket_fast','padel');

notify pgrst, 'reload schema';
