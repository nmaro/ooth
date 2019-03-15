type StrategyValues = {
  [key: string]: any;
};

type User = {
  _id: string;
  [key: string]: string | StrategyValues;
};

// Prisma is for relational data. So when defining the prisma datamodel
// we must decide what fields to have in the user table
// and any others will be added to an additional 'user meta' table.
// See: datamodel.prisma

const prismaUserFragment = `
fragment UserWithMeta on User {
  id
  oothMeta {
    id
    key
    data
    value
  }
}
`;


function oothMetaToObject(oothMeta: any) {
  let f = {};
  for (var i = 0, len = oothMeta.length; i < len; i++) {
    let key = oothMeta[i].key;
    // console.log(key);
    if (oothMeta[i].data) {
      // check the data parameter for json
      // console.log(oothMeta[i].data);
      (<any>f)[key] = oothMeta[i].data;
    } else {
      // check the value parameter for a string
      // console.log(oothMeta[i].value);
      (<any>f)[key] = oothMeta[i].value;
    }
  }
  // console.log({f});
  return f;
}

function dataForUpdateUser(oothMeta: any, fields: any) {
  let oothMetaIds: any[] = [];
  // first work out what the data should look like.
  // it is user.oothMeta with fields applied to it
  let matched = false;
  // loop through the new fields
  for (var key in fields) {
    matched = false;
    // loop through existing oothMeta keys
    for (var i = 0, len = oothMeta.length; i < len; i++) {
      // if this field key matches the key in the child loop
      if (key == oothMeta[i].key) {
        // let's update oothMeta[i].value or oothMeta[i].data
        if(typeof(fields[key]) == 'string') {
          delete oothMeta[i].data;
          oothMeta[i].value = fields[key];
        } else {
          delete oothMeta[i].value;
          oothMeta[i].data = fields[key];
        }
        // push this metaId to an array
        // and delete from the object
        oothMetaIds.push(oothMeta[i].id);
        delete oothMeta[i].id;
        matched = true;
      }
    }
    // if this field key hasn't matched any key in the child loop
    if(!matched) {
      // let's create oothMeta[i].value or oothMeta[i].data
      if(typeof(fields[key]) == 'string') {
        oothMeta.push({  key, value:  fields[key] });
      } else {
        oothMeta.push({ key, data: fields[key] });
      }
    }
  }

  let data: { oothMeta: { create: any[] } } = { oothMeta: { create: oothMeta } };
  return { data, oothMetaIds };
}

function dataForInsertUser(fields: any) {
  let data: { oothMeta: { create: any[] } } = { oothMeta: { create: [] } };
  for (var key in fields) {
    // console.log(key);
    // console.log(fields[key]);
    let createPart: any;
    if ( typeof(fields[key]) == 'string' ) {
      // is a string
      createPart = { key: key, value: fields[key] };
    } else {
      // is object 
      createPart = { key: key, data: fields[key] };  
    }
    data.oothMeta.create.push(createPart);
  }
  // console.log(JSON.stringify(data));
  return data;
}


function prepare(o: any): User {
  if (o && !o._id && o.id) {
    o._id = o.id;
    delete o.id;
  }
  // console.log(o);
  if (o && o.oothMeta.length > 0) {
    Object.assign(o, oothMetaToObject(o.oothMeta));
  }
  if (o && o.oothMeta) {
    delete o.oothMeta;
  }
  // console.log({o});
  return o;
}



export class OothPrisma {

  constructor(private prisma: any) {
    if (!prisma) {
      throw new Error('DB is required.');
    }

    this.prisma = prisma;
  }

  public getUserById = async (id: string) => {
    try {
      const user = await this.prisma.user({ id }).$fragment(prismaUserFragment);
      return prepare(user);
    } catch (err) {
      console.error(err);
      return null;  
    }
  };

  public updateUser = async (id: string, fields: { [key: string]: any }) => {
    try {
      const user = await this.prisma.user({ id }).$fragment(prismaUserFragment);
      const processed = await dataForUpdateUser(user.oothMeta, fields);
      const updatedUser = await this.prisma
        .updateUser({
          data: processed.data,
          where: {
            id,
          },
        })
        .$fragment(prismaUserFragment);
      // Tidy up - remove overwritten metas
      this.prisma.deleteManyOothMetas(
        { id_in: processed.oothMetaIds } 
      );  
      return updatedUser;
    } catch (err) {
      console.error(err);
      return null;
    }
  };  

  public insertUser = async (fields: { [key: string]: StrategyValues }) => {
    const data = await dataForInsertUser(fields);
    try {
      const { id } = await this.prisma.createUser(data); 
      // console.log({id})
      return id;
    } catch (err) { 
      console.error(err);
      return null; 
    }
  };

}
